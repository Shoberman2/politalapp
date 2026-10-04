import ThisWeekOnFloor from './ThisWeekOnFloor'
import SEO from './SEO'
import '../styles/ThisWeekOnFloor.css'

export default function ThisWeekPage() {
  return (
    <main className="twof-page">
      {/* Keep in step with '/this-week' in api/_lib/staticPages.js. */}
      <SEO
        title="This Week on the Floor"
        description="What the U.S. House has scheduled for floor consideration this week, from the Majority Leader’s weekly schedule, beside the roll-call votes Congress most recently recorded."
        path="/this-week"
      />
      <h1 className="twof-page-title">This week on the floor</h1>
      <p className="twof-page-intro">
        What the House has scheduled for floor consideration, from the Majority Leader’s
        weekly schedule on docs.house.gov, beside the roll-call votes Congress has most
        recently recorded. A listing means a bill may come up that week; it is not a
        promise of a vote, and the schedule names the week, not the day.
      </p>
      <ThisWeekOnFloor limit={20} />
    </main>
  )
}
