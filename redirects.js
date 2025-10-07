const redirects = async () => {
  const internetExplorerRedirect = {
    destination: '/ie-incompatible.html',
    has: [
      {
        type: 'header',
        key: 'user-agent',
        value: '(.*Trident.*)', // all ie browsers
      },
    ],
    permanent: false,
    source: '/:path((?!ie-incompatible.html$).*)', // all pages except the incompatibility page
  }

  const adminRedirect = {
    destination: '/admin',
    permanent: false,
    source: '/',
  }

  const redirects = [adminRedirect, internetExplorerRedirect]

  return redirects
}

export default redirects
