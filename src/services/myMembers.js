// Resolve a person's own members of Congress (House member + 2 senators) from
// a saved or typed location, reusing the lookups the rest of the app uses.
// Read-only: every call here is a GET to a public lookup service.

import {
  getDistrictFromAddress,
  getCongressionalDistrict,
  getHouseRepForDistrict,
  getSenatorsForState,
} from './district'
import { getMemberDetails } from './congress'

/**
 * @param {{ street?: string, city?: string, state?: string, zip?: string }} address
 * @returns {Promise<null | { state: string, district: string|null, members: object[] }>}
 */
export async function findMembersForAddress(address) {
  if (!address) return null
  const street = String(address.street || '').trim()
  const city = String(address.city || '').trim()
  const zip = String(address.zip || '').trim()
  let state = address.state ? String(address.state).trim().toUpperCase() : null
  let district = null

  if (/^\d{5}$/.test(zip)) {
    const info = await getDistrictFromAddress(zip).catch(() => null)
    if (info?.state) state = info.state
    if (info?.district != null) district = String(info.district)
  }

  if (street && state && district == null) {
    const cd = await getCongressionalDistrict(street, city, state, zip).catch(() => null)
    if (cd?.district != null) {
      district = String(cd.district)
      if (cd.state) state = cd.state
    }
  }

  if (!state) return null
  const members = await findMembersForDistrict(state, district)
  return { state, district, members }
}

/**
 * The members for a state and (optionally) a House district. With no
 * district only the senators come back: a ZIP alone does not say which House
 * district someone lives in, so we never guess one.
 * @returns {Promise<object[]>} House member first, then senators, each with `chamber`.
 */
export async function findMembersForDistrict(state, district = null) {
  const [house, senators] = await Promise.allSettled([
    district != null ? getHouseRepForDistrict(state, district) : Promise.resolve(null),
    getSenatorsForState(state),
  ])

  const members = []
  if (house.status === 'fulfilled' && house.value) members.push({ ...house.value, chamber: 'house' })
  if (senators.status === 'fulfilled') {
    for (const s of senators.value || []) members.push({ ...s, chamber: 'senate' })
  }
  if (!members.length && house.status === 'rejected' && senators.status === 'rejected') {
    throw senators.reason || house.reason
  }
  return members
}

/** Official website, office phone, and display name for one member, from Congress.gov. */
export async function getMemberContact(bioguideId) {
  const m = await getMemberDetails(bioguideId)
  if (!m) return {}
  return {
    officialWebsiteUrl: m.officialWebsiteUrl || null,
    phone: m.addressInformation?.phoneNumber || null,
    name: m.directOrderName || null,
  }
}
