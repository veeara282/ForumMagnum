import React, { FC, MouseEvent, useCallback, useEffect, useRef, useState } from "react";
import classNames from "classnames";
import { gql, useMutation, useQuery } from "@apollo/client";
import { AnalyticsContext } from "../../lib/analyticsEvents";
import { Components, registerComponent } from "../../lib/vulcan-lib";
import { CloudinaryPropsType } from "../common/CloudinaryImage2";
import { useCurrentUser } from "../common/withUser";
import { useLocation } from "../../lib/routeUtil";
import { useMulti } from "../../lib/crud/withMulti";
import { REVIEW_YEAR, eligibleToNominate } from "../../lib/reviewUtils";
import { TARGET_REVIEW_VOTING_NUM } from "./ReviewProgressVoting";
import { useMessages } from "../common/withMessages";
import DeferRender from "../common/DeferRender";

export type GivingSeasonHeart = {
  userId: string,
  displayName: string,
  x: number,
  y: number,
  theta: number,
}

const styles = (theme: ThemeType) => ({
  rootGivingSeason: {
    opacity: 0,
    transition: "opacity 0.25s ease",
    zIndex: 1,
    position: "relative",
   '&:hover': {
      opacity: 1
    }
  },
  rootScrolled: {
    
  },
  leftHeaderItems: {
    display: "flex",
    alignItems: "center",
  },
  toolbarGivingSeason: {
    justifyContent: "space-between",
  },
  activeStepLink: {
    textUnderlineOffset: '6px',
    textDecoration: 'underline',
    '&:hover': {
      textDecoration: 'underline',
    }
  },
  disabledStepLink: {
    opacity: 0.7,
  },
  gsRightHeaderItems: {
    position: "absolute",
    right: 0,
    top: 8,
    zIndex: 4,
    [theme.breakpoints.down("xs")]: {
      top: 4,
    }
  },
  gsContent: {
    marginTop: -20,
    fontFamily: theme.palette.fonts.sansSerifStack,
    fontSize: 30,
    fontWeight: 700,
    lineHeight: "120%",
    letterSpacing: "-0.76px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: "6px",
    height: "100%",
    [theme.breakpoints.down("sm")]: {
      display: "none",
    },
  },
  gsContentTitle: {
    "& a": {
      textDecoration: "underline",
      "&:hover": {
        textDecoration: "none",
        opacity: 1,
      },
    },
  },
  gsContentSubtitle: {
    marginTop: -5,
    fontSize: 18,
    fontWeight: 500,
  },
  gsButtons: {
    display: "flex",
    gap: "10px",
    zIndex: 4,
    marginTop: 6,
    "& .EAButton-variantContained": {
      background: theme.palette.text.alwaysWhite,
      fontWeight: 600,
      height: 36,
    },
  },
  gsButtonIcon: {
    marginRight: 4,
    marginLeft: -4,
    width: 20,
    height: 20,
  },
  gsHearts: {
    position: "relative",
    height: '100vh',
    zIndex: 1,
    [theme.breakpoints.down("sm")]: {
      display: "none",
    },
  },
  gsHeart: {
    position: "absolute",
    zIndex: 3,
    color: theme.palette.text.reviewBallotIcon,
    marginLeft: -12,
    marginTop: -12,
  },
  gsHeartTooltip: {
    backgroundColor: `${theme.palette.panelBackground.tooltipBackground2} !important`,
  },
  gsCanPlaceHeart: {
    cursor: "none !important",
  },
  gsHeartCursor: {
    pointerEvents: 'none',
    color: theme.palette.text.reviewBallotIcon,
  },
  gsDisabledHeart: {
    color: theme.palette.greyAlpha(0.25)
  },
  gsDisabledHeartTooltip: {
    fontFamily: theme.palette.fonts.sansSerifStack,
    position: 'absolute',
    width: '150px',
    textAlign: 'center',
    left: '50%',
    right: '50%',
    bottom: 'calc(-100% - 15px)',
    transform: 'translateX(-50%)'
  },
  gsLoadingHeart: {
    cursor: "wait !important",
  },
});

const votingPortalSocialImageProps: CloudinaryPropsType = {
  dpr: "auto",
  ar: "16:9",
  w: "1200",
  c: "fill",
  g: "center",
  q: "auto",
  f: "auto",
};

const heartsQuery = gql`
  query GivingSeasonHeartsQuery($electionName: String!) {
    GivingSeasonHearts(electionName: $electionName) {
      userId
      displayName
      x
      y
      theta
    }
  }
`;

const addHeartMutation = gql`
  mutation AddGivingSeasonHeart(
    $electionName: String!,
    $x: Float!,
    $y: Float!,
    $theta: Float!
  ) {
    AddGivingSeasonHeart(
      electionName: $electionName,
      x: $x,
      y: $y,
      theta: $theta
    ) {
      userId
      displayName
      x
      y
      theta
    }
  }
`;

const removeHeartMutation = gql`
  mutation RemoveGivingSeasonHeart($electionName: String!) {
    RemoveGivingSeasonHeart(electionName: $electionName) {
      userId
      displayName
      x
      y
      theta
    }
  }
`;

const isValidTarget = (e: EventTarget): e is HTMLDivElement => {
  return "tagName" in e && (e.tagName === "DIV" || e.tagName === "HEADER");
}
  

const MAX_THETA = 25;

const Heart: FC<{
  heart: GivingSeasonHeart,
  currentUser: UsersCurrent | null,
  removeHeart: () => Promise<void>,
  classes: ClassesType<typeof styles>,
  disabled?: boolean
}> = ({
  heart: {userId, displayName, x, y, theta},
  currentUser,
  removeHeart,
  classes,
  disabled
}) => {
  const isCurrentUser = userId === currentUser?._id;
  const title = !isCurrentUser ? `${displayName} voted!` : "You voted! (Click to remove icon)" 
  const onClick = useCallback(() => {
    if (isCurrentUser) {
      void removeHeart();
    }
  }, [isCurrentUser, removeHeart]);
  const {LWTooltip, ForumIcon} = Components;
  return (
    <div
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: `rotate(${theta}deg)`,
      }}
      className={classNames(classes.gsHeart, {
        [classes.gsHeartCursor]: !displayName,
        [classes.gsDisabledHeart]: disabled,
      })}
    >
      <LWTooltip
        title={title}
        placement="bottom"
        popperClassName={classes.gsHeartTooltip}
      >
        <ForumIcon icon="VoteBallot" onClick={onClick}/>
        {disabled && <div className={classes.gsDisabledHeartTooltip}>
          {!currentUser && "Log in to vote in the review (with an account created before 2022)"}
          {currentUser && !eligibleToNominate(currentUser) && "You need to have joined before 2022 to vote in the review"}
          {currentUser && eligibleToNominate(currentUser) && "Vote on at least 6 posts in the review to leave your icon"}
        </div>}
      </LWTooltip>
    </div>
  );
}

const ReviewVotingCanvas = ({
  classes,
}: {
  classes: ClassesType<typeof styles>,
}) => {
  const { pathname, currentRoute } = useLocation();
  const currentUser = useCurrentUser();
  const showHearts = currentRoute?.path === "/";

  const {data, refetch} = useQuery(heartsQuery, {
    variables: {
      electionName: "reviewVoting2022"
    },
    skip: !showHearts,
  });
  const [hearts, setHearts] = useState<GivingSeasonHeart[]>(data?.GivingSeasonHearts ?? []);

  useEffect(() => {
    setHearts(data?.GivingSeasonHearts ?? []);
  }, [data?.GivingSeasonHearts]);

  const [rawAddHeart, {loading: isAddingHeart}] = useMutation(
    addHeartMutation,
    {errorPolicy: "all"},
  );

  const [rawRemoveHeart, {loading: isRemovingHeart}] = useMutation(
    removeHeartMutation,
    {errorPolicy: "all"},
  );

  const headerRef = useRef<HTMLDivElement>(null);

  const normalizeCoords = useCallback((clientX: number, clientY: number) => {
    if (headerRef.current) {
      const bounds = headerRef.current.getBoundingClientRect();
      if (
        clientX > bounds.left &&
        clientX < bounds.right &&
        clientY > bounds.top &&
        clientY < bounds.bottom
      ) {
        return {
          x: (clientX - bounds.left) / bounds.width,
          y: (clientY - bounds.top) / bounds.height,
        };
      }
    }
    return null;
  }, [headerRef]);

  const addHeart = useCallback(async (x: number, y: number, theta: number) => {
    const result = await rawAddHeart({
      variables: {
        electionName: "reviewVoting2022",
        x,
        y,
        theta,
      },
    });
    void refetch();
    return result;
  }, [rawAddHeart, refetch]);

  const removeHeart = useCallback(async () => {
    const result = await rawRemoveHeart({
      variables: {
        electionName: "reviewVoting2022",
      }
    });
    const newHearts = result.data?.RemoveGivingSeasonHeart;
    if (Array.isArray(newHearts)) {
      setHearts(newHearts);
    }
    await refetch();
  }, [rawRemoveHeart, refetch]);

  const canAddHeart = !isAddingHeart;
  const [hoverPos, setHoverPos] = useState<{x: number, y: number} | null>(null);

  const onMouseMove = useCallback(({target, clientX, clientY}: MouseEvent) => {
    if (isValidTarget(target)) {
      setHoverPos(normalizeCoords(clientX, clientY));
    } else {
      setHoverPos(null);
    }
  }, [normalizeCoords]);

  const onMouseOut = useCallback(() => {
    setHoverPos(null);
  }, []);

  const { totalCount } = useMulti({
    terms: {
      view: "reviewVotesFromUser",
      userId: currentUser?._id,
      year: REVIEW_YEAR.toString()
    },
    collectionName: "ReviewVotes",
    fragmentName: 'reviewVoteFragment',
    enableTotal: true,
    skip: !currentUser,
    limit: TARGET_REVIEW_VOTING_NUM
  });

  const {flash} = useMessages();
  const userHasVotedEnough = (totalCount || 0) >= TARGET_REVIEW_VOTING_NUM;

  const onClick = useCallback(async ({target, clientX, clientY}: MouseEvent) => {
    if (isValidTarget(target)) {
      const coords = normalizeCoords(clientX, clientY);
      if (coords) {
        if (!userHasVotedEnough) {
          return flash("You need to have voted on at least six posts to place your ballot icon.")
        }
        const theta = Math.round((Math.random() * MAX_THETA * 2) - MAX_THETA);
        const result = await addHeart(coords.x, coords.y, theta);
        const newHearts = result.data?.AddGivingSeasonHeart;
        if (Array.isArray(newHearts)) {
          setHearts(newHearts);
        }
        setHoverPos(null);
      }
    }
  }, [normalizeCoords, addHeart, flash, userHasVotedEnough]);

  

  return (
    <AnalyticsContext pageSectionContext="header" siteEvent="reviewVoting2022">
      <div
        {...(canAddHeart ? {onMouseMove, onMouseOut, onClick} : {})}
        ref={headerRef}
        className={classNames(classes.rootGivingSeason, {
          [classes.gsCanPlaceHeart]: hoverPos,
          [classes.gsLoadingHeart]: isAddingHeart || isRemovingHeart,
        })}
      >
          <div className={classes.gsHearts}>
            <DeferRender ssr={false}>
              {hearts.map((heart) => (
                <Heart
                  key={heart.userId}
                  heart={heart}
                  currentUser={currentUser}
                  removeHeart={removeHeart}
                  classes={classes}
                />
              ))}
              {hoverPos &&
                <Heart
                  heart={{displayName: "", userId: "", theta: 0, ...hoverPos}}
                  currentUser={currentUser}
                  removeHeart={removeHeart}
                  classes={classes}
                  disabled={!userHasVotedEnough}
                />
              }
            </DeferRender>
          </div>
      </div>
    </AnalyticsContext>
  );
}

const ReviewVotingCanvasComponent = registerComponent(
  "ReviewVotingCanvas",
  ReviewVotingCanvas,
  {styles},
);

declare global {
  interface ComponentTypes {
    ReviewVotingCanvas: typeof ReviewVotingCanvasComponent
  }
}
