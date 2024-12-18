import React from "react";
import { Components, registerComponent } from "@/lib/vulcan-lib";
import { formatPercentile } from "./wrappedHelpers";
import { useForumWrappedContext } from "./hooks";

const styles = (_theme: ThemeType) => ({
  topPost: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    maxWidth: 380,
    margin: "24px auto 0",
  },
  nextTopPosts: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    width: "100%",
    maxWidth: 380,
    margin: "10px auto 0",
  },
});

/**
 * Section that displays the user's highest-karma post plus other data on their posts
 */
const WrappedTopPostSection = ({classes}: {
  classes: ClassesType<typeof styles>,
}) => {
  const {year, data} = useForumWrappedContext();
  if (!data.topPosts?.length) {
    return null;
  }

  // Only show this section if their top post got 10 karma
  const topPost = data.topPosts[0];
  if (topPost.baseScore < 10) {
    return null;
  }

  const percentile = formatPercentile(data.authorPercentile)

  const {WrappedSection, WrappedHeading, WrappedPost} = Components;
  return (
    <WrappedSection pageSectionContext="topPost">
      <WrappedHeading>
        Your highest-karma <em>post</em> in {year}
      </WrappedHeading>
      <div className={classes.topPost}>
        <WrappedPost post={data.topPosts[0]} />
      </div>
      {data.topPosts.length > 1 &&
        <>
          <div>
            Other posts you wrote this year...
          </div>
          <div className={classes.nextTopPosts}>
            {data.topPosts.slice(1).map((post) => (
              <WrappedPost key={post._id} post={post} />
            ))}
          </div>
        </>
      }
      <div>
        You wrote {data.postCount} post{data.postCount === 1 ? '' : 's'} in total
        this year.
        {percentile < 100 &&
          ` This means you're in the top ${percentile}% of post authors.`
        }
      </div>

    </WrappedSection>
  );
}

const WrappedTopPostSectionComponent = registerComponent(
  "WrappedTopPostSection",
  WrappedTopPostSection,
  {styles},
);

declare global {
  interface ComponentTypes {
    WrappedTopPostSection: typeof WrappedTopPostSectionComponent
  }
}
