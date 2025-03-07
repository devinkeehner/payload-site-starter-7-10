import type { Page } from '@/payload-types'

import { ArchiveBlock } from '@/components/blocks/archive-block'
import { CallToActionBlock } from '@/components/blocks/cta-block'
import { ContentBlock } from '@/components/blocks/content-block'
import { FormBlock } from '@/components/blocks/form-block'
import { MediaBlock } from '@/components/blocks/media-block'
import { BannerBlock } from '@/components/blocks/banner-block'

const blockComponents = {
  archive: ArchiveBlock,
  content: ContentBlock,
  cta: CallToActionBlock,
  formBlock: FormBlock,
  mediaBlock: MediaBlock,
  banner: BannerBlock,
}

export const RenderBlocks: React.FC<{
  blocks: Page['layout'][0][]
}> = (props) => {
  const { blocks } = props

  const hasBlocks = blocks && Array.isArray(blocks) && blocks.length > 0

  if (hasBlocks) {
    return (
      <>
        {blocks.map((block, index) => {
          const { blockType } = block

          if (blockType && blockType in blockComponents) {
            const Block = blockComponents[blockType]

            if (Block) {
              // @ts-ignore expected error
              return <Block key={index} index={index} {...block} disableInnerContainer />
            }
          }
          return null
        })}
      </>
    )
  }

  return null
}
