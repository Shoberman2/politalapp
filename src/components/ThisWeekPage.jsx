import ThisWeekOnFloor from './ThisWeekOnFloor'
import SEO from './SEO'
import { InfoDot } from './Term'
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
            <span className="ip-kicker">{ordinalCongress(currentCongress())} Congress<InfoDot id="congressNumber" label={`${ordinalCongress(currentCongress())} Congress`} /> · updated daily</span>
            <h1 className="ip-title">This week on the floor<InfoDot id="floor" /></h1>
            <p className="ip-lede">
              What the House plans to take up this week, from the weekly schedule its majority
              leader publishes on docs.house.gov, next to the votes Congress has just recorded.
              A listing means a bill may come up that week, not that it will, and the schedule
              names the week, not the day.
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
