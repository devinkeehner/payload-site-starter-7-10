type Config = {
  name: string
  url: string
  description: string
  logo: {
    path: string
    width: number
    height: number
  }
}

export const siteConfig: Config = {
  name: 'Connecticut House Republicans',
  url: 'https://payload-site-starter.vercel.app',
  description: 'Opinionated starter for building websites with Payload and Next.js',
  logo: {
    path: '/logo.svg',
    width: 120,
    height: 22.02,
  },
}
