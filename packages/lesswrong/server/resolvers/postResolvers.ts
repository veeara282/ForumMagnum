import { Posts } from '../../lib/collections/posts/collection';
import { sideCommentFilterMinKarma, sideCommentAlwaysExcludeKarma } from '../../lib/collections/posts/constants';
import { Comments } from '../../lib/collections/comments/collection';
import { SideCommentsResolverResult, getLastReadStatus, sideCommentCacheVersion } from '../../lib/collections/posts/schema';
import { augmentFieldsDict, denormalizedField, accessFilterMultiple } from '../../lib/utils/schemaUtils'
import { getLocalTime } from '../mapsUtils'
import { canUserEditPostMetadata, extractGoogleDocId, isNotHostedHere } from '../../lib/collections/posts/helpers';
import { matchSideComments } from '../sideComments';
import { captureException } from '@sentry/core';
import { getToCforPost } from '../tableOfContents';
import { getDefaultViewSelector } from '../../lib/utils/viewUtils';
import keyBy from 'lodash/keyBy';
import GraphQLJSON from 'graphql-type-json';
import { addGraphQLMutation, addGraphQLQuery, addGraphQLResolvers, addGraphQLSchema, createMutator } from '../vulcan-lib';
import { postIsCriticism } from '../languageModels/autoTagCallbacks';
import { createPaginatedResolver } from './paginatedResolver';
import { getDefaultPostLocationFields, getDialogueResponseIds, getDialogueMessageTimestamps, getPostHTML } from "../posts/utils";
import { buildRevision } from '../editor/make_editable_callbacks';
import { cheerioParse } from '../utils/htmlUtil';
import { isDialogueParticipant } from '../../components/posts/PostsPage/PostsPage';
import { marketInfoLoader } from '../../lib/collections/posts/annualReviewMarkets';
import { getWithCustomLoader } from '../../lib/loaders';
import { isLWorAF, isAF } from '../../lib/instanceSettings';
import { hasSideComments } from '../../lib/betas';
import SideCommentCaches from '../../lib/collections/sideCommentCaches/collection';
import { drive } from "@googleapis/drive";
import { convertImportedGoogleDoc } from '../editor/conversionUtils';
import Revisions from '../../lib/collections/revisions/collection';
import { randomId } from '../../lib/random';
import { getLatestRev, getNextVersion, htmlToChangeMetrics } from '../editor/utils';
import { canAccessGoogleDoc, getGoogleDocImportOAuthClient } from '../posts/googleDocImport';
import { GoogleDocMetadata, getLatestContentsRevision } from '../../lib/collections/revisions/helpers';
import { RecommendedPost, recombeeApi, recombeeRequestHelpers } from '../recombee/client';
import { HybridRecombeeConfiguration, RecombeeRecommendationArgs } from '../../lib/collections/users/recommendationSettings';
import { googleVertexApi } from '../google-vertex/client';
import { userCanDo } from '../../lib/vulcan-users/permissions';
import { PromptCachingBetaMessageParam } from '@anthropic-ai/sdk/resources/beta/prompt-caching/messages';
import { getAnthropicPromptCachingClientOrThrow } from '../languageModels/anthropicClient';
import { exampleJargonGlossary2, exampleJargonPost2 } from './exampleJargonPost';
import { ContentReplacedSubstringComponentInfo } from '@/components/common/ContentItemBody';
import { text } from 'stream/consumers';

augmentFieldsDict(Posts, {
  // Compute a denormalized start/end time for events, accounting for the
  // timezone the event's location is in. This is subtly wrong: it computes a
  // correct timestamp, but then the timezone part of that timezone gets lost
  // on the way in/out of the database, so if you use this field, what you're
  // getting is "local time mislabeled as UTC".
  localStartTime: {
    ...denormalizedField({
      needsUpdate: (data) => ('startTime' in data || 'googleLocation' in data),
      getValue: async (post) => {
        if (!post.startTime) return null
        const googleLocation = post.googleLocation || (await getDefaultPostLocationFields(post)).googleLocation
        if (!googleLocation) return null
        return await getLocalTime(post.startTime, googleLocation)
      }
    })
  },
  localEndTime: {
    ...denormalizedField({
      needsUpdate: (data) => ('endTime' in data || 'googleLocation' in data),
      getValue: async (post) => {
        if (!post.endTime) return null
        const googleLocation = post.googleLocation || (await getDefaultPostLocationFields(post)).googleLocation
        if (!googleLocation) return null
        return await getLocalTime(post.endTime, googleLocation)
      }
    })
  },
  tableOfContents: {
    resolveAs: {
      type: GraphQLJSON,
      resolver: async (document: DbPost, args: void, context: ResolverContext) => {
        try {
          return await getToCforPost({document, version: null, context});
        } catch(e) {
          captureException(e);
          return null;
        }
    },
    },
  },
  tableOfContentsRevision: {
    resolveAs: {
      type: GraphQLJSON,
      arguments: 'version: String',
      resolver: async (document: DbPost, args: {version: string}, context: ResolverContext) => {
        const { version=null } = args;
        try {
          return await getToCforPost({document, version, context});
        } catch(e) {
          captureException(e);
          return null;
        }
      },
    }
  },
  totalDialogueResponseCount: {
    resolveAs: {
      type: 'Int!', 
      resolver: async (post, _, context) => {
        if (!post.debate) return 0;
        const responseIds = await getDialogueResponseIds(post, context);
        return responseIds.length;
      }
    }
  },
  unreadDebateResponseCount: {
    resolveAs: {
      type: 'Int!',
      resolver: async (post, _, context): Promise<number> => {
        if (!post.collabEditorDialogue) return 0;

        const lastReadStatus = await getLastReadStatus(post, context);
        if (!lastReadStatus) return 0;

        const messageTimestamps = await getDialogueMessageTimestamps(post, context);
        const newMessageTimestamps = messageTimestamps.filter(ts => ts > lastReadStatus.lastUpdated)

        return newMessageTimestamps.length ?? 0
      }
    }
  },
  mostRecentPublishedDialogueResponseDate: {
    ...denormalizedField({
      getValue: async (post: DbPost, context: ResolverContext) => {
        if ((!post.debate && !post.collabEditorDialogue) || post.draft) return null;
        const messageTimestamps = await getDialogueMessageTimestamps(post, context);
        if (messageTimestamps.length === 0) { return null } 
        const lastTimestamp = messageTimestamps[messageTimestamps.length - 1]
        return lastTimestamp
      }
    })
  },
  sideComments: {
    resolveAs: {
      type: GraphQLJSON,
      resolver: async (post: DbPost, _args: void, context: ResolverContext): Promise<SideCommentsResolverResult|null> => {
        if (!hasSideComments || isNotHostedHere(post)) {
          return null;
        }

        // If the post was fetched with a SQL resolver then we will already
        // have the side comments cache available (even though the type system
        // doesn't know about it), otherwise we have to fetch it from the DB.
        const sqlFetchedPost = post as unknown as PostSideComments;
        // `undefined` means we didn't run a SQL resolver. `null` means we ran
        // a SQL resolver, but no relevant cache record was found.
        const cache = sqlFetchedPost.sideCommentsCache === undefined
            ? await SideCommentCaches.findOne({
              postId: post._id,
              version: sideCommentCacheVersion,
            })
            : sqlFetchedPost.sideCommentsCache;

        const cachedAt = new Date(cache?.createdAt ?? 0);
        const editedAt = new Date(post.modifiedAt ?? 0);

        const cacheIsValid = cache
          && (!post.lastCommentedAt || cachedAt > post.lastCommentedAt)
          && cachedAt > editedAt;

        // Here we fetch the comments for the post. For the sake of speed, we
        // project as few fields as possible. If the cache is invalid then we
        // need to fetch _all_ of the comments on the post complete with contents.
        // If the cache is valid then we only need the comments referenced in
        // the cache, and we don't need the contents.
        type CommentForSideComments =
          Pick<DbComment, "_id" | "userId" | "baseScore"> &
          Partial<Pick<DbComment, "contents">>;
        const comments: CommentForSideComments[] = await Comments.find({
          ...getDefaultViewSelector("Comments"),
          postId: post._id,
          ...(cacheIsValid && {
            _id: {$in: Object.values(cache.commentsByBlock).flat()},
          }),
        }, {
          projection: {
            userId: 1,
            baseScore: 1,
            contents: cacheIsValid ? 0 : 1,
          },
        }).fetch();

        let unfilteredResult: {
          annotatedHtml: string,
          commentsByBlock: Record<string,string[]>
        }|null = null;

        if (cacheIsValid) {
          unfilteredResult = {
            annotatedHtml: cache.annotatedHtml,
            commentsByBlock: cache.commentsByBlock,
          };
        } else {
          const toc = await getToCforPost({document: post, version: null, context});
          const html = toc?.html || await getPostHTML(post, context);
          const sideCommentMatches = matchSideComments({
            html: html ?? "",
            comments: comments.map(comment => ({
              _id: comment._id,
              html: comment.contents?.html ?? "",
            })),
          });

          void context.repos.sideComments.saveSideCommentCache(
            post._id,
            sideCommentMatches.html,
            sideCommentMatches.sideCommentsByBlock,
          );

          unfilteredResult = {
            annotatedHtml: sideCommentMatches.html,
            commentsByBlock: sideCommentMatches.sideCommentsByBlock
          };
        }

        const alwaysShownIds = new Set<string>([]);
        alwaysShownIds.add(post.userId);
        if (post.coauthorStatuses) {
          for (let {userId} of post.coauthorStatuses) {
            alwaysShownIds.add(userId);
          }
        }

        const commentsById = keyBy(comments, comment=>comment._id);
        let highKarmaCommentsByBlock: Record<string,string[]> = {};
        let nonnegativeKarmaCommentsByBlock: Record<string,string[]> = {};

        for (let blockID of Object.keys(unfilteredResult.commentsByBlock)) {
          const commentIdsHere = unfilteredResult.commentsByBlock[blockID];
          const highKarmaCommentIdsHere = commentIdsHere.filter(commentId => {
            const comment = commentsById[commentId];
            if (!comment)
              return false;
            else if (comment.baseScore >= sideCommentFilterMinKarma)
              return true;
            else if (alwaysShownIds.has(comment.userId))
              return true;
            else
              return false;
          });
          if (highKarmaCommentIdsHere.length > 0) {
            highKarmaCommentsByBlock[blockID] = highKarmaCommentIdsHere;
          }

          const nonnegativeKarmaCommentIdsHere = commentIdsHere.filter(commentId => {
            const comment = commentsById[commentId];
            if (!comment)
              return false;
            else if (alwaysShownIds.has(comment.userId))
              return true;
            else if (comment.baseScore <= sideCommentAlwaysExcludeKarma)
              return false;
            else
              return true;
          });
          if (nonnegativeKarmaCommentIdsHere.length > 0) {
            nonnegativeKarmaCommentsByBlock[blockID] = nonnegativeKarmaCommentIdsHere;
          }
        }

        return {
          html: unfilteredResult.annotatedHtml,
          commentsByBlock: nonnegativeKarmaCommentsByBlock,
          highKarmaCommentsByBlock: highKarmaCommentsByBlock,
        }
      }
    },
  },
  dialogueMessageContents: {
    resolveAs: {
      type: 'String',
      arguments: 'dialogueMessageId: String',
      resolver: async (post: DbPost, args: {dialogueMessageId?: string}, context: ResolverContext): Promise<string|null> => {
        const { currentUser } = context
        const { dialogueMessageId } = args
        if (!post.collabEditorDialogue) return null;
        if (!dialogueMessageId) return null;
        if (!currentUser) return null;
        const isParticipant = isDialogueParticipant(currentUser._id, post)
        if (!isParticipant) return null;

        const html = (await getLatestRev(post._id, "contents"))?.html ??
          (await getLatestContentsRevision(post, context))?.html ??
          "";

        const $ = cheerioParse(html)
        const message = $(`[message-id="${dialogueMessageId}"]`);
        return message.html();
      }
    }
  },
  annualReviewMarketProbability: {
    resolveAs: {
      type: 'Float',
      resolver: async (post: DbPost, args: void, context: ResolverContext) => {
        if (!isLWorAF) {
          return 0;
        }
        const market = await getWithCustomLoader(context, 'manifoldMarket', post._id, marketInfoLoader(context));
        return market?.probability
      }
    }
  },
  annualReviewMarketIsResolved: {
    resolveAs: {
      type: 'Boolean',
      resolver: async (post: DbPost, args: void, context: ResolverContext) => {
        if (!isLWorAF) {
          return false;
        }
        const market = await getWithCustomLoader(context, 'manifoldMarket', post._id, marketInfoLoader(context))
        return market?.isResolved
      }
    }
  },
  annualReviewMarketYear: {
    resolveAs: {
      type: 'Int',
      resolver: async (post: DbPost, args: void, context: ResolverContext) => {
        if (!isLWorAF) {
          return 0;
        }
        const market = await getWithCustomLoader(context, 'manifoldMarket', post._id, marketInfoLoader(context))
        return market?.year
      }
    }
  },
  
  firstVideoAttribsForPreview: {
    resolveAs: {
      type: GraphQLJSON,
      resolver: async (post: DbPost, args: void, context: ResolverContext) => {
        const videoHosts = [
          "https://www.youtube.com",
          "https://youtube.com",
          "https://youtu.be",
        ];
        const html = await getPostHTML(post, context);
        const $ = cheerioParse(html);
        const iframes = $("iframe").toArray();
        for (const iframe of iframes) {
          if ("attribs" in iframe) {
            const src = iframe.attribs.src ?? "";
            for (const host of videoHosts) {
              if (src.indexOf(host) === 0) {
                return iframe.attribs;
              }
            }
          }
        }
        return null;
      },
    },
  },

  
  jargonTerms: {
    resolveAs: {
      type: GraphQLJSON,
      resolver: async (post: DbPost, args: void, context: ResolverContext) => {

          const formatPrompt = `Please provide a glossary of any jargon terms in the text. The glossary should contain the term and some text explaining it. Analyze this post and output in a JSON array of objects with keys: term: "term” (string), text: text (string). The output should look like [{term: "term1", text: "text1"}, {term: "term2", text: "text2"}]. Do not return anything else.`

          async function queryClaudeJailbreak(prompt: PromptCachingBetaMessageParam[], maxTokens: number) {
            const client = getAnthropicPromptCachingClientOrThrow()
            return await client.messages.create({
              system: 
`You’re a Glossary AI. You are trying to write good explanations for jargon terms, for a hoverover tooltip in an essay on LessWrong.com. Please analyze the given text and identify the top 10 most important or frequently used jargon terms or concepts. For each term, provide:

The term itself
A concise one-line definition
A more detailed explanation in 2-4 sentences

Ensure that your explanations are clear and accessible to someone who may not be familiar with the subject matter. If the text doesn't contain 10 distinct jargon terms, it's okay to return fewer.

You should provide explanations of each term that are accessible to a layperson (but not too wordy). Use your general knowledge as well as the post's specific explanations or definitions of the terms to find a good definition of each term. Assume your audience is a smart and widely read layperson, so only needs rare words and concepts defined, and it's fine to return very few terms.

Output a JSON array of objects with keys: term: "term” (string), text: "text" (string). The output should look like [{term: "term1", text: "text1"}, {term: "term2", text: "text2"}]. Do not return anything else.`,
              model: "claude-3-5-sonnet-20240620",
              max_tokens: maxTokens,
              messages: prompt
            })
          }
        
          const contents = await getLatestContentsRevision(post);
          const html = contents?.html ?? ""
        
          const response = await Promise.all([queryClaudeJailbreak([
            {
              role: "user", 
              content: [{
                type: "text", 
                text: `${formatPrompt} The text is: ${exampleJargonPost2}`}]
            },
            { role: "assistant", 
              content: [{
                type: "text", 
                text: `[${exampleJargonGlossary2}]`}]},
            {
              role: "user",
              content: [{
                type: "text",
                text: `${formatPrompt} The text is: ${html}`
              }]
            }, 
          ], 5000), 
          ])
          if (response[0].content[0].type === "text") {

            console.log("response", response[0].content[0].text)
            
            const jargonTerms = JSON.parse(response[0].content[0].text)

            let glossary: Record<string,ContentReplacedSubstringComponentInfo> = {}

            for (const term of jargonTerms) {
              glossary[term.term] = {
                componentName: "JargonTooltip",
                props: {
                  term: term.term,
                  text: term.text,
                },
              }
            }
            return glossary
          } else {
            // eslint-disable-next-line no-console
            console.log("Claude didn't return text")
            return null
          }
      },
    },
  },
})




export type PostIsCriticismRequest = {
  title: string,
  contentType: string,
  body: string
}

addGraphQLResolvers({
  Query: {
    async UserReadHistory(root: void, args: {limit: number|undefined}, context: ResolverContext) {
      const { currentUser, repos } = context
      if (!currentUser) {
        throw new Error('Must be logged in to view read history')
      }

      const posts = await repos.posts.getReadHistoryForUser(currentUser._id, args.limit ?? 10)
      const filteredPosts = accessFilterMultiple(currentUser, Posts, posts, context);
      return {
        posts: filteredPosts,
      }
    },
    async PostIsCriticism(root: void, { args }: { args: PostIsCriticismRequest }, context: ResolverContext) {
      const { currentUser } = context
      if (!currentUser) {
        throw new Error('Must be logged in to check post')
      }

      return await postIsCriticism(args)
    },
    async DigestPosts(root: void, {num}: {num: number}, context: ResolverContext) {
      const { repos } = context
      return await repos.posts.getPostsForOnsiteDigest(num)
    },
    async DigestPlannerData(root: void, {digestId, startDate, endDate}: {digestId: string, startDate: Date, endDate: Date}, context: ResolverContext) {
      const { currentUser, repos } = context
      if (!currentUser || !currentUser.isAdmin) {
        throw new Error('Permission denied')
      }
      const eligiblePosts = await repos.posts.getEligiblePostsForDigest(digestId, startDate, endDate)
      if (!eligiblePosts.length) return []

      // TODO: finish implementing this once we figure out what to do with it
      // const votesRepo = new VotesRepo()
      // const votes = await votesRepo.getDigestPlannerVotesForPosts(eligiblePosts.map(p => p._id))
      // console.log('DigestPlannerData votes', votes)

      return eligiblePosts.map(post => {
        // const postVotes = votes.find(v => v.postId === post._id)
        // const rating = postVotes ?
        //   Math.round(
        //     ((postVotes.smallUpvoteCount + 2 * postVotes.bigUpvoteCount) - (postVotes.smallDownvoteCount / 2 + postVotes.bigDownvoteCount)) / 10
        //   ) : 0

        return {
          post,
          digestPost: {
            _id: post.digestPostId,
            emailDigestStatus: post.emailDigestStatus,
            onsiteDigestStatus: post.onsiteDigestStatus
          },
          rating: 0
        }
      })
    },
    async UsersReadPostsOfTargetUser(root: void, { userId, targetUserId, limit = 20 }: { userId: string, targetUserId: string, limit: number }, context: ResolverContext) {
      const { currentUser, repos } = context
      if (!currentUser) {
        throw new Error('Must be logged in to view read posts of target user')
      }

      const posts = await repos.posts.getUsersReadPostsOfTargetUser(userId, targetUserId, limit)
      return await accessFilterMultiple(currentUser, Posts, posts, context)
    },
    async CanAccessGoogleDoc(root: void, { fileUrl }: { fileUrl: string }, context: ResolverContext) {
      const { currentUser } = context
      if (!currentUser) {
        return null;
      }

      return canAccessGoogleDoc(fileUrl)
    },
  },
  Mutation: {
    async ImportGoogleDoc(root: void, { fileUrl, postId }: { fileUrl: string, postId?: string | null }, context: ResolverContext) {
      if (!fileUrl) {
        throw new Error("fileUrl must be given")
      }
      const fileId = extractGoogleDocId(fileUrl)

      if (!fileId) {
        throw new Error(`Could not extract id from google doc url: ${fileUrl}`)
      }

      const { currentUser } = context;
      if (!currentUser) {
        throw new Error('Must be logged in to import google doc')
      }

      if (postId) {
        const post = await Posts.findOne({_id: postId})

        if (!post) {
          throw new Error(`No post with id: ${postId}`)
        }

        if (!canUserEditPostMetadata(currentUser, post)) {
          throw new Error(`User doesn't have permission to edit post with id: ${postId}`)
        }
      }

      const oauth2Client = await getGoogleDocImportOAuthClient();

      const googleDrive = drive({
        version: "v3",
        auth: oauth2Client,
      });

      // Retrieve the file's metadata to get the name
      const fileMetadata = await googleDrive.files.get({
        fileId,
        fields: 'id, name, description, version, createdTime, modifiedTime, size'
      });

      const docMetadata = fileMetadata.data as GoogleDocMetadata;

      const fileContents = await googleDrive.files.export(
        {
          fileId,
          mimeType: "text/html",
        },
        { responseType: "text" }
      );

      const html = fileContents.data as string;

      if (!html || !docMetadata) {
        throw new Error("Unable to import google doc")
      }

      const finalPostId = postId ?? randomId()
      // Converting to ckeditor markup does some thing like removing styles to standardise
      // the result, so we always want to do this first before converting to whatever format the user
      // is using
      const ckEditorMarkup = await convertImportedGoogleDoc({ html, postId: finalPostId })
      const commitMessage = `[Google Doc import] Last modified: ${docMetadata.modifiedTime}, Name: "${docMetadata.name}"`
      const originalContents = {type: "ckEditorMarkup", data: ckEditorMarkup}

      if (postId) {
        const previousRev = await getLatestRev(postId, "contents")
        const revisionType = "major"

        const newRevision: Partial<DbRevision> = {
          ...(await buildRevision({
            originalContents,
            currentUser,
          })),
          documentId: postId,
          draft: true,
          fieldName: "contents",
          collectionName: "Posts",
          version: getNextVersion(previousRev, revisionType, true),
          updateType: revisionType,
          commitMessage,
          changeMetrics: htmlToChangeMetrics(previousRev?.html || "", html),
          googleDocMetadata: docMetadata
        };

        await createMutator({
          collection: Revisions,
          document: newRevision,
          validate: false,
        });

        return await Posts.findOne({_id: postId})
      } else {
        let afField: Partial<ReplaceFieldsOfType<DbPost, EditableFieldContents, EditableFieldInsertion>> = {};
        if (isAF) {
          afField = !userCanDo(currentUser, 'posts.alignment.new')
            ? { suggestForAlignmentUserIds: [currentUser._id] }
            : { af: true };
        }

        // Create a draft post if one doesn't exist. This runs `buildRevision` itself via a callback
        const { data: post } = await createMutator({
          collection: Posts,
          document: {
            _id: finalPostId,
            userId: currentUser._id,
            title: docMetadata.name,
            ...({
              // Contents is a resolver only field, but there is handling for it
              // in `createMutator`/`updateMutator`
              contents: {
                originalContents,
                commitMessage,
                googleDocMetadata: docMetadata
              },
            }),
            draft: true,
            ...afField,
          },
          currentUser,
          validate: false,
        })

        return post;
      }
    },
  }
})

addGraphQLQuery("UsersReadPostsOfTargetUser(userId: String!, targetUserId: String!, limit: Int): [Post!]");

addGraphQLSchema(`
  type UserReadHistoryResult {
    posts: [Post!]
  }
`)
addGraphQLQuery('UserReadHistory(limit: Int): UserReadHistoryResult')
addGraphQLQuery('PostIsCriticism(args: JSON): Boolean')

addGraphQLSchema(`
  type DigestPlannerPost {
    post: Post
    digestPost: DigestPost
    rating: Int
  }
`)
addGraphQLQuery('DigestPlannerData(digestId: String, startDate: Date, endDate: Date): [DigestPlannerPost]')
addGraphQLQuery('DigestPosts(num: Int): [Post]')

addGraphQLQuery("CanAccessGoogleDoc(fileUrl: String!): Boolean");
addGraphQLMutation("ImportGoogleDoc(fileUrl: String!, postId: String): Post");

createPaginatedResolver({
  name: "DigestHighlights",
  graphQLType: "Post",
  callback: async (
    context: ResolverContext,
    limit: number,
  ): Promise<DbPost[]> => context.repos.posts.getDigestHighlights({limit}),
});

createPaginatedResolver({
  name: "DigestPostsThisWeek",
  graphQLType: "Post",
  callback: async (
    context: ResolverContext,
    limit: number,
  ): Promise<DbPost[]> => context.repos.posts.getTopWeeklyDigestPosts(limit),
  cacheMaxAgeMs: 1000 * 60 * 60, // 1 hour
});

createPaginatedResolver({
  name: "CuratedAndPopularThisWeek",
  graphQLType: "Post",
  callback: async (
    {repos, currentUser}: ResolverContext,
    limit: number,
  ): Promise<DbPost[]> => repos.posts.getCuratedAndPopularPosts({
    currentUser,
    limit,
  }),
  cacheMaxAgeMs: 1000 * 60 * 60, // 1 hour
});

createPaginatedResolver({
  name: "RecentlyActiveDialogues",
  graphQLType: "Post",
  callback: async (
    {repos}: ResolverContext,
    limit: number,
  ): Promise<DbPost[]> => repos.posts.getRecentlyActiveDialogues(limit),
  cacheMaxAgeMs: 1000 * 60 * 10, // 10 min
});

createPaginatedResolver({
  name: "MyDialogues",
  graphQLType: "Post",
  callback: async (
    context: ResolverContext,
    limit: number,
  ): Promise<DbPost[]> => {
      const {repos, currentUser} = context
      if (!currentUser) return []
      return repos.posts.getMyActiveDialogues(currentUser._id, limit);
    },
  // Caching is not user specific, do not use caching here else you will share users' drafts
  cacheMaxAgeMs: 0, 
});

addGraphQLSchema(`
  type RecombeeRecommendedPost {
    post: Post!
    scenario: String
    recommId: String
    generatedAt: Date
    curated: Boolean
    stickied: Boolean
  }
`);

createPaginatedResolver({
  name: "RecombeeLatestPosts",
  graphQLType: "RecombeeRecommendedPost",
  args: { settings: "JSON" },
  callback: async (
    context: ResolverContext,
    limit: number,
    args: { settings: RecombeeRecommendationArgs }
  ): Promise<RecommendedPost[]> => {
    const recombeeUser = recombeeRequestHelpers.getRecombeeUser(context);

    if (!recombeeUser) {
      throw new Error(`You must be logged in or have a clientId to use Recombee recommendations right now`);
    }

    return await recombeeApi.getRecommendationsForUser(recombeeUser, limit, args.settings, context);
  }
});

createPaginatedResolver({
  name: "RecombeeHybridPosts",
  graphQLType: "RecombeeRecommendedPost",
  args: { settings: "JSON" },
  callback: async (
    context: ResolverContext,
    limit: number,
    args: { settings: HybridRecombeeConfiguration }
  ): Promise<RecommendedPost[]> => {
    const recombeeUser = recombeeRequestHelpers.getRecombeeUser(context);

    if (!recombeeUser) {
      throw new Error(`You must be logged in or have a clientId to use Recombee recommendations right now`);
    }

    return await recombeeApi.getHybridRecommendationsForUser(recombeeUser, limit, args.settings, context);
  }
});

createPaginatedResolver({
  name: "PostsWithActiveDiscussion",
  graphQLType: "Post",
  callback: async (context, limit): Promise<DbPost[]> => {
    const { currentUser, repos } = context;
    if (!currentUser) {
      throw new Error('You must be logged in to see actively discussed posts.');
    }

    return await repos.posts.getActivelyDiscussedPosts(limit);
  }
});

createPaginatedResolver({
  name: "PostsBySubscribedAuthors",
  graphQLType: "Post",
  callback: async (context, limit): Promise<DbPost[]> => {
    const { currentUser, repos } = context;
    if (!currentUser) {
      throw new Error('You must be logged in to see posts with activity from your subscrptions.');
    }

    return await repos.posts.getPostsFromPostSubscriptions(currentUser._id, limit);
  }
});

addGraphQLSchema(`
  type VertexRecommendedPost {
    post: Post!
    attributionId: String
  }
`);

interface VertexRecommendedPost {
  post: Partial<DbPost>;
  attributionId?: string | null;
}

createPaginatedResolver({
  name: "GoogleVertexPosts",
  graphQLType: "VertexRecommendedPost",
  args: { settings: "JSON" },
  callback: async (
    context: ResolverContext,
    limit: number,
  ): Promise<VertexRecommendedPost[]> => {
    const { currentUser } = context;

    if (!currentUser) {
      throw new Error(`You must logged in to use Google Vertex recommendations right now`);
    }

    return await googleVertexApi.getRecommendations(limit, context);
  }
});
