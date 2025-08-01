import { Card, CardPostData } from '@/components/site/card'
import { Container, Section } from '../layout'

export type Props = {
  posts: CardPostData[]
}

export function CollectionArchive({ posts }: Props) {
  return (
    <Section>
      <Container>
        <div className="grid grid-cols-4 sm:grid-cols-8 lg:grid-cols-12 gap-y-4 gap-x-4 lg:gap-y-8 lg:gap-x-8 xl:gap-x-8">
          {posts?.map((result, index) => {
            if (typeof result === 'object' && result !== null) {
              return (
                <div className="col-span-4" key={index}>
                  <Card className="h-full" doc={result} relationTo="posts" showCategories />
                </div>
              )
            }

            return null
          })}
        </div>
      </Container>
    </Section>
  )
}
