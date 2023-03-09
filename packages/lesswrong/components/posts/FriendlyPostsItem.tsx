import React, { MouseEvent } from "react";
import { registerComponent, Components } from "../../lib/vulcan-lib";
import { AnalyticsContext } from "../../lib/analyticsEvents";
import { usePostsItem, PostsItemConfig } from "./usePostsItem";
import { HashLink } from "../common/HashLink";
import { useVote } from "../votes/withVote";
import { useHistory } from "react-router";
import { SECTION_WIDTH } from "../common/SingleColumnSection";
import withErrorBoundary from "../common/withErrorBoundary";
import classNames from "classnames";

export const styles = (theme: ThemeType): JssStyles => ({
  root: {
    maxWidth: SECTION_WIDTH,
    display: "flex",
    alignItems: "center",
    background: theme.palette.grey[0],
    border: `1px solid ${theme.palette.grey[200]}`,
    borderRadius: 6, // TODO Use theme.borderRadius.default once it's merged
    padding: `10px 8px 10px 0`,
    fontFamily: theme.palette.fonts.sansSerifStack,
    fontWeight: 500,
    fontSize: 14,
    color: theme.palette.grey[600],
    cursor: "pointer",
    [theme.breakpoints.down("xs")]: {
      paddingRight: 12,
    },
  },
  karma: {
    width: 40,
    minWidth: 40,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  tagRelWrapper: {
    position: "relative",
    marginLeft: 30,
  },
  voteButton: {
    fontSize: 25,
    margin: "-12px 0 -4px 0",
  },
  details: {
    flexGrow: 1,
    minWidth: 0, // flexbox black magic
  },
  title: {
    fontWeight: 600,
    fontSize: 16,
    fontFamily: theme.palette.fonts.sansSerifStack,
    marginBottom: 3,
  },
  titleOverflow: {
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  meta: {
    display: "flex",
    alignItems: "center",
    "& > :first-child": {
      flexGrow: 1,
    },
  },
  secondaryContainer: {
    display: "flex",
    alignItems: "center",
  },
  audio: {
    "& svg": {
      width: 15,
      margin: "3px -8px 0 3px",
    },
  },
  tag: {
    margin: "0 5px 0 15px",
  },
  readTime: {
    minWidth: 75,
    textAlign: "right",
    whiteSpace: "nowrap",
    paddingRight: 10,
  },
  comments: {
    minWidth: 50,
    display: "flex",
    alignItems: "center",
    "& svg": {
      height: 18,
      marginRight: 1,
    },
  },
  bookmark: {
    minWidth: 20,
    "&:hover": {
      opacity: 0.5,
    },
  },
  bookmarkIcon: {
    fontSize: 18,
    marginTop: 2,
    color: theme.palette.grey[600],
  },
  hideOnMobile: {
    [theme.breakpoints.down("xs")]: {
      display: "none",
    },
  },
  onlyMobile: {
    [theme.breakpoints.up("sm")]: {
      display: "none",
    },
  },
});

export type FriendlyPostsListProps = PostsItemConfig & {
  classes: ClassesType,
};

const FriendlyPostsItem = ({classes, ...props}: FriendlyPostsListProps) => {
  const {
    post,
    postLink,
    tagRel,
    commentsLink,
    commentCount,
    primaryTag,
    hasAudio,
    sticky,
    showDraftTag,
    showPersonalIcon,
    strikethroughTitle,
    isRead,
    showReadCheckbox,
    analyticsProps,
  } = usePostsItem(props);
  const voteProps = useVote(post, "Posts");
  const history = useHistory();

  // In order to make the entire "cell" a link to the post we need some special
  // handling to make sure that all of the other links and buttons inside the cell
  // still work. We do this by checking if the click happened inside an <a> tag
  // before navigating to the post.
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (typeof target.closest === "function" && !target.closest("a")) {
      history.push(postLink);
    }
  }

  const {
    PostsTitle, PostsItemDate, ForumIcon, BookmarkButton, OverallVoteButton,
    FooterTag, PostsUserAndCoauthors, PostsItemTagRelevance, PostsItemKarma,
  } = Components;

  const SecondaryInfo = () => (
    <>
      <div className={classes.readTime}>
        {post.readTimeMinutes || 1}m read
      </div>
      <HashLink to={commentsLink} className={classes.comments}>
        <ForumIcon icon="Comment" />
        {commentCount}
      </HashLink>
      <div className={classes.bookmark}>
        <a> {/* The `a` tag prevents clicks from navigating to the post */}
          <BookmarkButton post={post} className={classes.bookmarkIcon} />
        </a>
      </div>
    </>
  );

  return (
    <AnalyticsContext {...analyticsProps}>
      <div className={classes.root} onClick={onClick}>
        <div className={classes.karma}>
          {tagRel
            ? <div className={classes.tagRelWrapper}>
              <PostsItemTagRelevance tagRel={tagRel} post={post} />
            </div>
            : <>
              <div className={classes.voteButton}>
                <a> {/* The `a` tag prevents clicks from navigating to the post */}
                  <OverallVoteButton
                    orientation="up"
                    color="secondary"
                    upOrDown="Upvote"
                    solidArrow
                    {...voteProps}
                  />
                </a>
              </div>
              <PostsItemKarma post={post} />
            </>
          }
        </div>
        <div className={classes.details}>
          <div className={classes.titleOverflow}>
            <PostsTitle
              {...{
                post,
                postLink,
                sticky,
                showDraftTag,
                showPersonalIcon,
                strikethroughTitle,
              }}
              read={isRead && !showReadCheckbox}
              curatedIconLeft={false}
              iconsOnLeft
              className={classes.title}
            />
          </div>
          <div className={classes.meta}>
            <div>
              <PostsUserAndCoauthors post={post} />
              , <PostsItemDate post={post} noStyles includeAgo />
            </div>
            <div className={classNames(classes.secondaryContainer, classes.onlyMobile)}>
              <SecondaryInfo />
            </div>
          </div>
        </div>
        <div className={classNames(classes.secondaryContainer, classes.hideOnMobile)}>
          <div className={classes.audio}>
            {hasAudio && <ForumIcon icon="VolumeUp" />}
          </div>
          <div className={classes.tag}>
            {primaryTag && <FooterTag tag={primaryTag} smallText />}
          </div>
          <SecondaryInfo />
        </div>
      </div>
    </AnalyticsContext>
  );
}

const FriendlyPostsItemComponent = registerComponent(
  "FriendlyPostsItem",
  FriendlyPostsItem,
  {
    styles,
    stylePriority: 1,
    hocs: [withErrorBoundary],
    areEqual: {
      terms: "deep",
    },
  },
);

declare global {
  interface ComponentTypes {
    FriendlyPostsItem: typeof FriendlyPostsItemComponent
  }
}
