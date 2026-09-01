import config from '@payload-config'
import { getPayload } from 'payload'

export const getCategories = async () => {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'categories',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    sort: 'name',
  })

  return result.docs
}
