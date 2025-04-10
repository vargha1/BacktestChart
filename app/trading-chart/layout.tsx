import React from 'react'

function layout({children ,} : Readonly<{children : React.ReactNode;}>) {
  return (
    <main>
        {children}
    </main>
  )
}

export default layout