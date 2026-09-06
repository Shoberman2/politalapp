import { validateApiKey } from '../../_lib/auth.js'
import { supabaseAdmin } from '../../_lib/supabase.js'
import { handleCors, jsonResponse, errorResponse, nodeHandler } from '../../_lib/response.js'
import { logUsage } from '../../_lib/usage.js'
import { getDataUpdatedAt } from '../../_lib/etlMeta.js'
import { congressGovMemberUrl } from '../../_lib/site.js'

async function route(req) {
  const cors = handleCors(req)
  if (cors) return cors

  const start = Date.now()
  const auth = await validateApiKey(req)
  if (auth.error) return auth.error

  const url = new URL(req.url, 'http://localhost')
  const bioguideId = url.pathname.split('/').pop()

  const { data: member, error } = await supabaseAdmin
    .from('politicians')
    .select('*')
    .eq('id', bioguideId)
    .single()

  if (error || !member) {
    logUsage(auth.key, `/v1/members/${bioguideId}`, 'GET', 404, Date.now() - start)
    return errorResponse(`Member not found: ${bioguideId}`, 404, 'NOT_FOUND')
  }

  logUsage(auth.key, `/v1/members/${bioguideId}`, 'GET', 200, Date.now() - start)

  const sourceUrl = congressGovMemberUrl(member.id)
  return jsonResponse({
    data: { ...member, source_url: sourceUrl },
    meta: { api_version: 'v1', source_url: sourceUrl, data_updated_at: await getDataUpdatedAt() },
  }, 200, { Link: `<${sourceUrl}>; rel="canonical"` })
}

export default nodeHandler(route)

export const config = { runtime: 'nodejs' }
