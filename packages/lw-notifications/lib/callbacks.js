import Notifications from './collection.js';
import Users from 'meteor/nova:users';
import { addCallback, newMutation } from 'meteor/nova:core';

const createNotifications = (userIds, notificationType, documentType, documentId) => {
  userIds.forEach(userId => {

    let user = Users.findOne(userId);

    let notificationData = {
      userId: userId,
      documentId: documentId,
      type: documentType,
      notificationMessage: notificationType
    }

    newMutation({
      action: 'notifications.new',
      collection: Notifications,
      document: notificationData,
      currentUser: user,
      validate: false
    });
  });
}

// hard dependency on Comments and Posts packages
const Comments = Package['nova:comments'].default;
const Posts = Package['nova:posts'].default;

/**
 * @summary Add notification callback when a post is approved
 */
const PostsApprovedNotification = (post) => {
  createNotifications([post.userId], 'postApproved', 'post', post._id);
}
addCallback("posts.approve.async", PostsApprovedNotification);

/**
 * @summary Add new post notification callback on post submit
 */
const PostsNewNotifications = (post) => {

  let adminIds = _.pluck(Users.adminUsers({fields: {_id:1}}), '_id');
  let usersToNotify = _.pluck(Users.find({'notifications_posts': true}, {fields: {_id:1}}).fetch(), '_id');

  // remove post author ID from arrays
  adminIds = _.without(adminIds, post.userId);
  usersToNotify = _.without(usersToNotify, post.userId);

  if (post.status === Posts.config.STATUS_PENDING) {
    // if post is pending, only notify admins
    createNotifications(adminIds, 'newPendingPost', 'post', post._id);
  } else {
    // if post is approved, notify everybody
    createNotifications(usersToNotify, 'newPost', 'post', post._id);
  }
}
addCallback("posts.new.async", PostsNewNotifications);

// add new comment notification callback on comment submit
const CommentsNewNotifications = (comment) => {

  // note: dummy content has disableNotifications set to true
  if(Meteor.isServer && !comment.disableNotifications) {

    const post = Posts.findOne(comment.postId);

    // keep track of whom we've notified (so that we don't notify the same user twice for one comment,
    // if e.g. they're both the author of the post and the author of a comment being replied to)
    let notifiedUsers = [];

    // 1. Notify author of comment being replied to
    if (!!comment.parentCommentId) {
      const parentComment = Comments.findOne(comment.parentCommentId);

      // do not notify author of parent comment if they're replying to their own comment
      if (parentComment.userId !== comment.userId) {
        const parentCommentAuthor = Users.findOne(parentComment.userId);

        // do not notify parent comment author if they have reply notifications turned off
        if (Users.getSetting(parentCommentAuthor, "notifications_replies", true)) {
          createNotifications([parentCommentAuthor.userId], 'newReply', 'comment', comment._id);
          notifiedUsers.push(parentCommentAuthor.userId);
        }
      }
    }

    // 2. Notify author of post (if they have new comment notifications turned on)
    //    but do not notify author of post if they're the ones posting the comment
    //    nor if we just sent them a newReply notification above
    const postAuthor = Users.findOne(post.userId);
    if (comment.userId !== postAuthor._id && !_.contains(notifiedUsers, postAuthor._id)
        && Users.getSetting(postAuthor, "notifications_comments", true)) {

      createNotifications([postAuthor._id], 'newComment', 'comment', comment._id);
      notifiedUsers.push(postAuthor._id);
    }

    // ROGTODO: allow author to unsubscribe, and only notify subscribers
    // 3. Notify users who are subscribed to the post
    console.log('post.subscribers:');
    console.log(post.subscribers);
    if (!!post.subscribers && !!post.subscribers.length) {
      // remove userIds of users that have already been notified
      // and of comment author (they could be replying in a thread they're subscribed to)
      let subscribersToNotify = _.difference(post.subscribers, notifiedUsers, [comment.userId]);
      createNotifications(subscribersToNotify, 'newCommentSubscribed', 'comment', comment._id);
    }
  }
}
addCallback("comments.new.async", CommentsNewNotifications);
