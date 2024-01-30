import React, { useState, useEffect } from 'react';
import { Components, registerComponent } from '../../../lib/vulcan-lib';
import withErrorBoundary from '../../common/withErrorBoundary'
import { isServer } from '../../../lib/executionEnvironment';
import { useLocation } from '../../../lib/routeUtil';
import type { AnchorOffset, ToCData, ToCSection, ToCSectionWithOffset } from '../../../lib/tableOfContents';
import qs from 'qs'
import isEmpty from 'lodash/isEmpty';
import filter from 'lodash/filter';
import { getCurrentSectionMark, ScrollHighlightLandmark, useScrollHighlight } from '../../hooks/useScrollHighlight';
import { useNavigate } from '../../../lib/reactRouterWrapper';
import { sectionsHaveOffsets } from '../../common/SidebarsWrapper';

export interface ToCDisplayOptions {
  /**
   * Convert section titles from all-caps to title-case. Used for the Concepts page
   * where the LW version has all-caps section headings as a form of bolding.
   */
  downcaseAllCapsHeadings?: boolean
  
  /**
   * Don't show sections nested below a certain depth. Used on the LW version of the
   * Concepts page, where there would otherwise be section headings for subcategories
   * of the core tags, resulting in a ToC that's overwhelmingly big.
   */
  maxHeadingDepth?: number
  
  /**
   * Extra rows to add to the bottom of the ToC. You'll want to use this instead of
   * adding extra React components after the ToC if those rows have corresponding
   * anchors and should be highlighted based on scroll position.
   */
  addedRows?: ToCSection[],
}

const topSection = "top";

const normalizeOffsets = (sections: ToCSectionWithOffset[]) => {
  let subtract = 0
  const firstSectionOffset: ToCSectionWithOffset = {
    ...sections[0],
    offset: 0
  }
  
  return sections.map(section => {
    const normalizedOffset = {
      ...section,
      offset: section.offset - subtract
    }
    subtract = section.offset
    return normalizedOffset
  })
}

const isRegularClick = (ev: React.MouseEvent) => {
  if (!ev) return false;
  return ev.button===0 && !ev.ctrlKey && !ev.shiftKey && !ev.altKey && !ev.metaKey;
}

const styles = (theme: ThemeType): JssStyles => ({
  root: {
    position: 'fixed',
    left: 0,
    top: 0,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-evenly'
  }
})

const FixedPositionToc = ({tocSections, title, onClickSection, displayOptions, classes}: {
  tocSections: ToCSection[],
  title: string|null,
  onClickSection?: ()=>void,
  displayOptions?: ToCDisplayOptions,
  classes: ClassesType,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { query } = location;

  const jumpToAnchor = (anchor: string) => {
    if (isServer) return;

    const anchorY = getAnchorY(anchor);
    if (anchorY !== null) {
      delete query.commentId;
      navigate({
        search: isEmpty(query) ? '' : `?${qs.stringify(query)}`,
        hash: `#${anchor}`,
      });
      let sectionYdocumentSpace = anchorY + window.scrollY;
      jumpToY(sectionYdocumentSpace);
    }
  }

  const { TableOfContentsRow, AnswerTocRow } = Components;

  console.log("in component!! AAAA", {tocSections})

  let filteredSections = (displayOptions?.maxHeadingDepth && tocSections)
    ? filter(tocSections, s=>s.level <= displayOptions.maxHeadingDepth!)
    : tocSections;

  if (displayOptions?.addedRows) {
    filteredSections = [...filteredSections, ...displayOptions.addedRows];
  }
  
  const { landmarkName: currentSection } = useScrollHighlight([
    ...filteredSections.map((section): ScrollHighlightLandmark => ({
      landmarkName: section.anchor,
      elementId: section.anchor,
      position: "centerOfElement"
    })),
    {
      landmarkName: "comments",
      elementId: "postBody",
      position: "bottomOfElement"
    },
  ]);

  if (!tocSections)
    return <div/>

  const handleClick = async (ev: React.SyntheticEvent, jumpToSection: ()=>void): Promise<void> => {
    ev.preventDefault();
    if (onClickSection) {
      onClickSection();
      // One of the things this callback can do is expand folded-up text which
      // might contain the anchor we want to scroll to. We wait for a setTimeout
      // here, to allow React re-rendering to finish in that case.
      await new Promise((resolve,reject) => setTimeout(resolve, 0));
    }
    jumpToSection();
  }

  // Since the Table of Contents data is sent as part of the post data and
  // partially generated from the post html, changing the answers ordering
  // in the ToC is not trivial to do via a graphql query.
  // Separating the ToC part with answers would require some refactoring,
  // but for now we can just sort the answers client side.
  const answersSorting = query?.answersSorting;
  if (answersSorting === "newest" || answersSorting === "oldest") {
    filteredSections = sectionsWithAnswersSorted(filteredSections, answersSorting);
  }


  console.log({filteredSections})
  if(sectionsHaveOffsets(filteredSections)) {
    filteredSections = normalizeOffsets(filteredSections);
    console.log("offsets assigned!")
  }


  function adjustHeadingText(text: string|undefined) {
    if (!text) return "";
    if (displayOptions?.downcaseAllCapsHeadings) {
      return downcaseIfAllCaps(text.trim());
    } else {
      return text.trim();
    }
  }

  return <div className={classes.root}>
    <TableOfContentsRow key="postTitle"
      href="#"
      offset={0}
      onClick={ev => {
        if (isRegularClick(ev)) {
          void handleClick(ev, () => {
            navigate("#");
            jumpToY(0)
          });
        }
      }}
      highlighted={currentSection === "above"}
      title
    >
      {title?.trim()}
    </TableOfContentsRow>
    
    {filteredSections.map((section, index) => {
      return (
        <TableOfContentsRow
          key={section.anchor}
          indentLevel={section.level}
          divider={section.divider}
          highlighted={section.anchor === currentSection}
          href={"#"+section.anchor}
          offset={section.offset}
          onClick={(ev) => {
            if (isRegularClick(ev)) {
              void handleClick(ev, () => {
                jumpToAnchor(section.anchor)
              });
            }
          }}
          answer={!!section.answer}
        >
          {section.answer
            ? <AnswerTocRow answer={section.answer} />
            : <span>{adjustHeadingText(section.title)}</span>
          }
        </TableOfContentsRow>
      )
    })}
  </div>
}


/**
 * Return the screen-space Y coordinate of an anchor. (Screen-space meaning
 * if you've scrolled, the scroll is subtracted from the effective Y
 * position.)
 */
export const getAnchorY = (anchorName: string): number|null => {
  let anchor = window.document.getElementById(anchorName);
  if (anchor) {
    let anchorBounds = anchor.getBoundingClientRect();
    return anchorBounds.top + (anchorBounds.height/2);
  } else {
    return null
  }
}

export const jumpToY = (y: number) => {
  if (isServer) return;

  try {
    window.scrollTo({
      top: y - getCurrentSectionMark() + 1,
      behavior: "smooth"
    });
  } catch(e) {
    // eslint-disable-next-line no-console
    console.warn("scrollTo not supported, using link fallback", e)
  }
}


const FixedPositionTocComponent = registerComponent(
  "FixedPositionToC", FixedPositionToc, {
    hocs: [withErrorBoundary],
    styles
  }
);


/**
 * Returns a shallow copy of the ToC sections with question answers sorted by date,
 * without changing the position of other sections.
 */
const sectionsWithAnswersSorted = (
  sections: ToCSection[],
  sorting: "newest" | "oldest"
) => {
  const answersSectionsIndexes = sections
    .map((section, index) => [section, index] as const)
    .filter(([section, _]) => !!section.answer);
  const originalIndexes = answersSectionsIndexes.map(([_, originalIndex]) => originalIndex);
  const answersSections = answersSectionsIndexes.map(([section, _]) => section);

  const sign = sorting === "newest" ? 1 : -1;
  answersSections.sort((section1, section2) => {
    const value1 = section1.answer?.postedAt || "";
    const value2 = section2.answer?.postedAt || "";
    if (value1 < value2) { return sign; }
    if (value1 > value2) { return -sign; }
    return 0;
  });

  const sortedSections = [...sections];
  for (let [i, section] of answersSections.entries()) {
    sortedSections[originalIndexes[i]] = section;
  }
  return sortedSections;
};

function downcaseIfAllCaps(text: string) {
  // If already mixed-case, don't do anything
  if (text !== text.toUpperCase())
    return text;
  
  // Split on spaces, downcase everything except the first character of each token
  const tokens = text.split(' ');
  const downcaseToken = (tok: string) => {
    if (tok.length > 1) {
      return tok.substr(0,1) + tok.substr(1).toLowerCase();
    } else {
      return tok;
    }
  }
  return tokens.map(tok => downcaseToken(tok)).join(' ');
}

declare global {
  interface ComponentTypes {
    FixedPositionToC: typeof FixedPositionTocComponent
  }
}
