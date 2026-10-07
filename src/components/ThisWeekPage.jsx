import ThisWeekOnFloor from './ThisWeekOnFloor'
import SEO from './SEO'
import { currentCongress } from '../../shared/openData.js'
import { ordinalCongress } from '../../shared/memberRecord.js'
import '../styles/InfoPage.css'
import '../styles/ThisWeekOnFloor.css'

export default function ThisWeekPage() {
  return (
    // The hero uses the shared info-page system. The floor component sits
    // outside `.info-page` on purpose: InfoPage.css styles bare p and li
    // elements, which would override the component's own row type. The root is
    // a <div>: App.jsx already renders the page's <main>.
    <div className="bw twof-page">
      {/* Keep in step with '/this-week' in api/_lib/staticPages.js. */}
      <SEO
        title="This Week on the Floor"
        description="What the U.S. House has scheduled for floor consideration this week, from the Majority Leader’s weekly schedule, beside the roll-call votes Congress most recently recorded."
        path="/this-week"
      />
      <div className="info-page ip-wide">
        <section className="ip-hero">
          <div className="ip-inner">
            <span className="ip-kicker">{ordinalCongress(currentCongress())} Congress · updated daily</span>
            <h1 className="ip-title">This week on the floor</h1>
            <p className="ip-lede">
              What the House has scheduled for floor consideration, from the Majority Leader’s
              weekly schedule on docs.house.gov, beside the roll-call votes Congress has most
              recently recorded. A listing means a bill may come up that week; it is not a
              promise of a vote, and the schedule names the week, not the day.
            </p>
          </div>
        </section>
      </div>
      <div className="twof-page-body">
        <ThisWeekOnFloor limit={20} showHeader={false} />
      </div>
    </div>
  )
}
