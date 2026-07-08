import React, { useEffect, useState } from 'react'
import { CommandMenu } from './command-menu'
import Streak from './streak'
import { HeaderBar } from '~/components/layout'

export const Header = () => {
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  if (!isHydrated) return null

  return (
    <HeaderBar>
      <CommandMenu />
      <Streak />
    </HeaderBar>
  )
}
