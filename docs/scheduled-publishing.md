# Scheduled publishing

When you schedule a post, Klipt needs something to wake it up at that time: to mark the post as
published, add it to the sitemap and lists, record it in Activity, and fire the `entry.published`
webhook that tells your website to rebuild or refresh.

Klipt has an address for exactly that: **`/api/cron/publish`**. Each call publishes everything whose
time has come, on every site, then sends the webhooks. Call it every minute and posts go live within
a minute of their time.

## Why you need a scheduler

Vercel can call addresses on a schedule (cron jobs), but on the free **Hobby** plan a cron job runs
at most **once a day**. Klipt already uses that daily slot (06:00 UTC) as a safety net. For
minute-by-minute timing, use a free outside service to call the address instead.

Without one, nothing breaks: a scheduled post still goes live the next time someone opens Klipt or
your website asks the content API for content, and at the daily check at the latest. The webhook
waits until then.

## Before you start

You need the `CRON_SECRET` environment variable in Vercel (any long random value; see the README,
step 6). The scheduler sends it to prove the call is yours. Calls without it get `401 unauthorized`.

To see or set it: Vercel → your project → **Settings → Environment Variables** → `CRON_SECRET`.
Keep it private.

## Set it up on cron-job.org (free)

1. Create a free account at [cron-job.org](https://cron-job.org) and choose **Create cronjob**.
2. **Title:** `Klipt scheduled publishing`.
3. **URL:** your Klipt address followed by `/api/cron/publish`, for example
   `https://klipt-eta.vercel.app/api/cron/publish`. Settings › Publishing in Klipt shows the exact
   address with a copy button.
4. **Execution schedule:** every **1 minute**.
5. Open the **Advanced** tab. Under **Headers**, add one header:
   - Key: `Authorization`
   - Value: `Bearer ` followed by your `CRON_SECRET` (the word Bearer, one space, then the secret).
6. Leave the request method as **GET** and save.

The labels on cron-job.org may differ slightly; the three things that matter are the URL, "every
minute" and the `Authorization` header.

## Check that it works

- In Klipt, open **Settings › Publishing**. Within a couple of minutes the **Scheduled publishing**
  card shows a green **Running every minute** chip and "Last run: less than a minute ago". It turns
  amber again if no run arrives for 5 minutes.
- On cron-job.org, the job's history should show status **200**. A **401** means the header is
  missing or the secret doesn't match.
- To test end to end, schedule a post two minutes ahead, wait, and reload it: it shows as published,
  and **Team › Activity** says "Klipt published “…” as scheduled".

Each call answers with a short summary, for example
`{"published":1,"sites":1,"webhooksSent":2,"webhooksFailed":0}`.

## Other ways to call it

Anything that can make a GET request with a header every minute works:

- **Upstash QStash** schedules (free tier): create a schedule for the same URL and header.
- **GitHub Actions** with a `schedule:` trigger: free, but GitHub often runs scheduled workflows
  several minutes late, so timing is looser.
- **Vercel Pro:** cron jobs can run every minute. Add `{ "path": "/api/cron/publish", "schedule": "* * * * *" }`
  to `crons` in `vercel.json`; Vercel sends the secret header itself.

Calling it more than once a minute, or from two services at once, is safe: each post is published,
logged and announced exactly once.
