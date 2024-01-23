import { addCronJob } from '../cronUtil';
import { Posts } from '../../lib/collections/posts';
import * as _ from 'underscore';
import { Comments } from '../../lib/collections/comments';
import { createAdminContext, createMutator } from '../vulcan-lib';


addCronJob({
  name: 'checkScheduledPosts',
  interval: 'every 10 minutes',
  async job() {
    // fetch all posts tagged as future
    const scheduledPosts = await Posts.find({isFuture: true}, {projection: {_id: 1, status: 1, postedAt: 1, userId: 1, title: 1}}).fetch();

    // filter the scheduled posts to retrieve only the one that should update, considering their schedule
    const postsToUpdate = scheduledPosts.filter(post => post.postedAt <= new Date());

    // update posts found
    if (!_.isEmpty(postsToUpdate)) {
      const postsIds = _.pluck(postsToUpdate, '_id');
      await Posts.rawUpdateMany({_id: {$in: postsIds}}, {$set: {isFuture: false}}, {multi: true});

      // log the action
      console.log('// Scheduled posts approved:', postsIds); // eslint-disable-line
    }
  }
});

const manifoldAPIKey = ""
const lwReviewUserBot = ""

const makeComment = async (postId: string, title: string, year: string, marketUrl: string, botUser: DbUser | null) => {

  const commentString = `<p>The <a href="https://www.lesswrong.com/bestoflesswrong">LessWrong Review</a> runs every year to select the posts that have most stood the test of time. This post is not yet eligible for review, but will be at the end of 2025. The top fifty or so posts are featured prominently on the site throughout the year. Will this post make the top 50?</p><figure class="media"><div data-oembed-url="${marketUrl}">
        <div class="manifold-preview">
          <iframe src="https://manifold.markets/embed/MrMagnolia/what-will-the-next-curated-lesswron">
        </iframe></div>
      </div></figure>
  `

  const createdComment = await createMutator({
    collection: Comments,
    document: {
      postId: postId,
      userId: lwReviewUserBot,
      contents: {originalContents: {
        type: "html",
        data: commentString
      }}
    },
    currentUser: botUser
  })

}

addCronJob({
  name: 'makeReviewManifoldMarket',
  interval: 'every 1 minutes',
  async job() {

    // fetch all posts above X karma without markets posted in 2022 or later
    const highKarmaNoMarketPosts = await Posts.find({baseScore: {$gte: 100}, postedAt: {$gte: `2022-01-01`}, manifoldReviewMarketId: null}, {projection: {_id: 1, title: 1, postedAt: 1}, limit:1}).fetch();

    const context = createAdminContext();

    const botUser = await context.Users.findOne({_id: lwReviewUserBot})

    highKarmaNoMarketPosts.forEach(async post => {


      const year = post.postedAt.getFullYear()
      const question = `Will the post "${post.title.length < 72 ? post.title : post.title.slice(0,69)+"..."}" make the top fifty in the LessWrong ${year} Annual Review?`
      const description = "" // post.title
      const closeTime = new Date(year + 2, 1, 1) // i.e. february 1st of the next next year (so if year is 2022, feb 1 of 2024)
      const visibility = "unlisted" // set this based on whether we're in dev or prod?
      const groupIds = ["LessWrong Annual Review", `LessWrong ${year} Annual Review`]

      const result = await fetch("https://api.manifold.markets./v0/market", {
        method: "POST",
        headers: {
          authorization: `Key ${manifoldAPIKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outcomeType: "BINARY",
          question: question,
          description: description,
          closeTime: Number(closeTime),
          visibility: visibility,
          // groupIds: groupIds,
          initialProb: 14
        })
      })


      // don't run this and also await result.text(), weirdly that causes the latter one to explode
      const liteMarket = await result.json() // get this from the result

      console.log("liteMarket", liteMarket)
      console.log("liteMarket id", liteMarket.id)
      console.log("post id", post._id)

      console.log(result)

      await Posts.rawUpdateOne(post._id, {$set: {manifoldReviewMarketId: liteMarket.id}})

      await makeComment(post._id, post.title, String(year), liteMarket.url, botUser)

      // make comments on the posts with the markets after creation
      // make a description for the market, including link to explanation of what's going on 
      // move to LessWrong manifold account
      // add field for resolved markets? not clear how we want to handle this 
      // write autoresolving code -- when review finishes want to resolve the market -- can use code about whether review is over and what ranking the post got in the review

      async function pingSlackWebhook(webhookURL: string, data: any) {
        try {
          const response = await fetch(webhookURL, {
            method: 'POST',
            body: JSON.stringify(data),
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          return response
        } catch (error) {
          //eslint-disable-next-line no-console
          console.error('There was a problem with the fetch operation: ', error);
        }
      }

      // ping the slack webhook to inform team of market creation. We will get rid of this before pushing to prod
      const webhookURL = "https://hooks.slack.com/triggers/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"
      void pingSlackWebhook(webhookURL, liteMarket)

    })



  }
});
