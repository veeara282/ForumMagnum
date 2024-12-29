import React, { useRef } from "react";
import { Components, registerComponent } from "@/lib/vulcan-lib";
import { Link } from "@/lib/reactRouterWrapper";
import { tagGetUrl } from "@/lib/collections/tags/helpers";
import { lightbulbIcon } from "@/components/icons/lightbulbIcon";
import { getUserProfileLink } from "./wrappedHelpers";
import { useForumWrappedContext } from "./hooks";
import { getWrappedVideo } from "./videos";
import classNames from "classnames";

const styles = (theme: ThemeType) => ({
  root: {
    width: "100%",
    maxWidth: 500,
    padding: '12px 24px 14px',
    color: theme.palette.text.alwaysWhite,
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    textAlign: "left",
    margin: "0 auto 20px",
    [theme.breakpoints.up("lg")]: {
      marginTop: 40,
      marginBottom: 40,
    },
  },
  transparent: {},
  grey: {
    background: theme.palette.wrapped.personalityGrey,
  },
  red: {
    background: theme.palette.wrapped.personalityRed,
  },
  blue: {
    background: theme.palette.wrapped.personalityBlue,
  },
  green: {
    background: theme.palette.wrapped.personalityGreen,
  },
  row: {
    display: "flex",
    flexDirection: "row",
    gap: "22px",
  },
  imageContainer: {
    display: "flex",
    justifyContent: "center",
  },
  image: {
    height: 120,
  },
  heading: {
    fontSize: 12,
    lineHeight: '15px',
    fontWeight: 500,
    marginBottom: 2,
  },
  personality: {
    fontSize: 22,
    lineHeight: '28px',
    fontWeight: 700,
    letterSpacing: "-0.48px",
  },
  stat: {
    fontSize: 22,
    lineHeight: '22px',
    fontWeight: 700,
    letterSpacing: "-0.64px",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "3px",
    marginTop: 6,
  },
  listItem: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    fontSize: 13,
    lineHeight: '18px',
    fontWeight: 600,
    letterSpacing: '0.2px',
    textWrap: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  iconPlaceholder: {
    width: 16,
    height: 16,
  },
  footer: {
    display: "flex",
    flexDirection: "row",
    gap: "4px",
    alignItems: "center",
    justifyContent: "center",
    textTransform: "uppercase",
    fontSize: 11,
    fontWeight: 400,
    lineHeight: "110%",
    letterSpacing: "0.39px",
  },
  footerLightbulb: {
    width: 22,
  },
  shareContainer: {
    display: "flex",
    justifyContent: "center",
    marginBottom: 50,
  },
});

/**
 * Section that displays a screenshottable summary of the user's Wrapped data
 */
const WrappedSummarySection = ({classes}: {
  classes: ClassesType<typeof styles>,
}) => {
  const {
    year,
    data: {totalSeconds, postsReadCount, karmaChange, mostReadAuthors, mostReadTopics, personality},
  } = useForumWrappedContext();
  const {color, frameCropped, brightness} = getWrappedVideo(personality);
  const screenshotRef = useRef<HTMLDivElement>(null);
  const hoursSpent = (totalSeconds / 3600).toFixed(1)
  const {
    WrappedSection, UsersProfileImage, CoreTagIcon, WrappedShareButton,
  } = Components;
  return (
    <WrappedSection pageSectionContext="summary" noPadding>
      <div className={classNames(classes.root, classes[color])} ref={screenshotRef}>
        <div>
          <div className={classes.imageContainer}>
            <img
              src={frameCropped}
              className={classes.image}
              style={{filter: `brightness(${brightness})`}}
            />
          </div>
          <div className={classes.heading}>EA Forum personality</div>
          <div className={classes.personality}>{personality}</div>
        </div>
        <div className={classes.row}>
          <div>
            <div className={classes.heading}>Hours spent</div>
            <div className={classes.stat}>{hoursSpent}</div>
          </div>
          <div>
            <div className={classes.heading}>Posts read</div>
            <div className={classes.stat}>{postsReadCount}</div>
          </div>
          {karmaChange > 0 && (
            <div>
              <div className={classes.heading}>Karma</div>
              <div className={classes.stat}>+{karmaChange}</div>
            </div>
          )}
        </div>
        {mostReadAuthors.length > 0 &&
          <div>
            <div className={classes.heading}>Most-read authors</div>
            <div className={classes.list}>
              {mostReadAuthors.slice(0,3).map((author) => (
                <div key={author.slug} className={classes.listItem}>
                  <UsersProfileImage size={20} user={author} />
                  <Link to={getUserProfileLink(author.slug, year)}>
                    {author.displayName}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        }
        {mostReadTopics.length > 0 &&
          <div>
            <div className={classes.heading}>Most-read topics</div>
            <div className={classes.list}>
              {mostReadTopics.map((topic) => (
                <div key={topic.slug} className={classes.listItem}>
                  <CoreTagIcon
                    tag={topic}
                    fallbackNode={<div className={classes.iconPlaceholder} />}
                  />
                  <Link to={tagGetUrl({slug: topic.slug})}>
                    {topic.name}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        }
        <div className={classes.footer}>
          <div className={classes.footerLightbulb}>{lightbulbIcon}</div>
          <div>forum.effectivealtruism.org/wrapped</div>
        </div>
      </div>
      <div className={classes.shareContainer}>
        <WrappedShareButton name="Summary" screenshotRef={screenshotRef} />
      </div>
    </WrappedSection>
  );
}

const WrappedSummarySectionComponent = registerComponent(
  "WrappedSummarySection",
  WrappedSummarySection,
  {styles},
);

declare global {
  interface ComponentTypes {
    WrappedSummarySection: typeof WrappedSummarySectionComponent
  }
}
