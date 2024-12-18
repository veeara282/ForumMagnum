import React from "react";
import { Components, registerComponent } from "@/lib/vulcan-lib";
import { Link } from "@/lib/reactRouterWrapper";
import { getUserProfileLink } from "./wrappedHelpers";
import type { WrappedMostReadAuthor, WrappedYear } from "./hooks";

const styles = (theme: ThemeType) => ({
  authors: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    width: "100%",
    maxWidth: 300,
    textAlign: "left",
    margin: "30px auto 0",
  },
  author: {
    display: "flex",
    gap: "16px",
    background: theme.palette.wrapped.panelBackground,
    fontSize: 14,
    fontWeight: 400,
    lineHeight: "20px",
    borderRadius: theme.borderRadius.default,
    padding: "8px 16px",
  },
  authorName: {
    fontSize: 14,
    fontWeight: 700,
    lineHeight: "20px",
    margin: 0,
  },
  authorReadCount: {
    margin: 0,
  },
});

const WrappedMostReadAuthorSection = ({authors, postCount, year, classes}: {
  authors: WrappedMostReadAuthor[],
  postCount: number,
  year: WrappedYear,
  classes: ClassesType<typeof styles>,
}) => {
  const {WrappedSection, WrappedHeading} = Components;
  return (
    <WrappedSection pageSectionContext="mostReadAuthors">
      <WrappedHeading>
        You read {postCount} posts this year
      </WrappedHeading>
      {authors[0]?.displayName &&
        <div>
          Your most read author was {authors[0].displayName}
        </div>
      }
      <div className={classes.authors}>
        {authors.map(author => {
          return <article key={author.slug} className={classes.author}>
            <Components.UsersProfileImage size={40} user={author} />
            <div>
              <h3 className={classes.authorName}>
                <Link to={getUserProfileLink(author.slug, year)}>
                  {author.displayName}
                </Link>
              </h3>
              <p className={classes.authorReadCount}>
                {author.count} post{author.count === 1 ? "" : "s"} read
              </p>
            </div>
          </article>
        })}
      </div>
    </WrappedSection>
  );
}

const WrappedMostReadAuthorSectionComponent = registerComponent(
  "WrappedMostReadAuthorSection",
  WrappedMostReadAuthorSection,
  {styles},
);

declare global {
  interface ComponentTypes {
    WrappedMostReadAuthorSection: typeof WrappedMostReadAuthorSectionComponent
  }
}
