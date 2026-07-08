import React, { useEffect, useState } from 'react'
import { CommandMenu } from './command-menu'
import Streak from './streak'
import { HeaderBar, Inline } from '~/components/layout'
import { WorkstationHeaderProject } from '~/components/domain/navigation/workstation-header-project'

export const Header = () => {
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  if (!isHydrated) return null

  return (
    <HeaderBar>
      <WorkstationHeaderProject />
      <Inline gap="lg">
        <CommandMenu />
        <Streak />
      </Inline>
    </HeaderBar>
  )
}
