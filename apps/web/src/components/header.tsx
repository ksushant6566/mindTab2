import React, { useEffect, useState } from 'react'
import { CommandMenu } from './command-menu'
import { HeaderBar, HeaderMeta, Inline } from '~/components/layout'
import { WorkstationHeaderProject } from '~/components/domain/navigation/workstation-header-project'

export const Header = () => {
  const [isHydrated, setIsHydrated] = useState(false)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  if (!isHydrated) return null

  return (
    <HeaderBar>
      <WorkstationHeaderProject />
      <Inline gap="lg">
        <CommandMenu />
        <HeaderDateTime date={now} />
      </Inline>
    </HeaderBar>
  )
}

function HeaderDateTime({ date }: { date: Date }) {
  const label = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)

  return (
    <HeaderMeta dateTime={date.toISOString()}>
      {label}
    </HeaderMeta>
  )
}
