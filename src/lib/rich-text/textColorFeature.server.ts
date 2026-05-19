import { createServerFeature } from '@payloadcms/richtext-lexical'

// Note: ClientFeature is resolved by Payload admin using admin.importMap.baseDir (src)
// So we reference the module relative to src/ without aliases
export const TextColorFeature = createServerFeature({
  feature: () => {
    return {
      ClientFeature: './lib/rich-text/client#TextColorFeatureClient',
    }
  },
  key: 'textColor',
})
