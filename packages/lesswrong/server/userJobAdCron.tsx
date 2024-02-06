import React from 'react';
import moment from 'moment';
import { JOB_AD_DATA } from '../components/ea-forum/TargetedJobAd';
import { addCronJob } from './cronUtil';
import UserJobAds from '../lib/collections/userJobAds/collection';
import { Users } from '../lib/collections/users/collection';
import uniq from 'lodash/fp/uniq';
import { wrapAndSendEmail } from './emails/renderEmail';
import './emailComponents/EmailJobAdReminder';
import { Components } from './vulcan-lib';


addCronJob({
  name: 'sendJobAdReminderEmails',
  interval: `every 1 day`,
  async job() {
    // Find all the job ads where the deadline is one week away
    const jobNames = Object.keys(JOB_AD_DATA).filter(jobName => {
      const deadline = JOB_AD_DATA[jobName].deadline
      deadline && moment().add(1, 'week').isSameOrBefore(deadline) && moment().add(1, 'week').add(1, 'day').isAfter(deadline)
    })
    if (!jobNames.length) return;

    // Find all the user reminders set for these jobs
    const userJobAds = await UserJobAds.find({
      jobName: {$in: jobNames},
      adState: 'reminderSet'
    }).fetch()
    if (!userJobAds.length) return;
    
    // Get all the email recipient data
    const users = await Users.find({
      _id: {$in: uniq(userJobAds.map(u => u.userId))},
      email: {$exists: true},
      deleteContent: {$ne: true},
      deleted: {$ne: true}
    }).fetch()
    if (!users.length) return;
    
    for (let userJobAd of userJobAds) {
      const recipient = users.find(u => u._id === userJobAd.userId)
      if (recipient) {
        const jobAdData = JOB_AD_DATA[userJobAd.jobName]
        void wrapAndSendEmail({
          user: recipient,
          subject: `Reminder: ${jobAdData.role} role at ${jobAdData.org}`,
          body: <Components.EmailJobAdReminder jobName={userJobAd.jobName} />,
          force: true  // ignore the "unsubscribe to all" in this case, since the user initiated it
        })
      }
    }
    
    return `Sent email reminders for ${jobNames.join(', ')} to ${users.length} users`
  }
});
