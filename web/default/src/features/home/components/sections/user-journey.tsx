/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  FileText,
  Gift,
  KeyRound,
  LogIn,
  UserCheck,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { AnimateInView } from '@/components/animate-in-view'

interface JourneyStep {
  title: string
  description: string
  href: string
  icon: LucideIcon
}

interface UserJourneyProps {
  isAuthenticated?: boolean
}

export function UserJourney(props: UserJourneyProps) {
  const { t } = useTranslation()

  const steps: JourneyStep[] = [
    {
      title: t('Register or sign in'),
      description: t('Create an account and enter the console.'),
      href: props.isAuthenticated ? '/dashboard' : '/sign-up',
      icon: LogIn,
    },
    {
      title: t('Recharge wallet'),
      description: t('Add credits, redeem codes, and review billing.'),
      href: '/wallet',
      icon: Wallet,
    },
    {
      title: t('Create API Key'),
      description: t('Generate a token for your application.'),
      href: '/keys',
      icon: KeyRound,
    },
    {
      title: t('View usage logs'),
      description: t('Inspect request history, spend, and errors.'),
      href: '/usage-logs',
      icon: FileText,
    },
    {
      title: t('Invite users'),
      description: t('Copy your affiliate link from the wallet page.'),
      href: '/wallet',
      icon: Gift,
    },
    {
      title: t('Daily Check-in'),
      description: t('Check in from Profile when the feature is enabled.'),
      href: '/profile',
      icon: UserCheck,
    },
  ]

  return (
    <section className='border-border/40 relative z-10 border-t px-6 py-20 md:py-28'>
      <div className='mx-auto max-w-6xl'>
        <AnimateInView className='mb-10 flex flex-col gap-4 md:mb-12 md:flex-row md:items-end md:justify-between'>
          <div className='max-w-2xl'>
            <p className='text-muted-foreground mb-3 text-xs font-medium tracking-widest uppercase'>
              {t('User path')}
            </p>
            <h2 className='text-2xl font-bold tracking-tight md:text-3xl'>
              {t('A complete API user loop')}
            </h2>
            <p className='text-muted-foreground/80 mt-3 text-sm leading-relaxed md:text-base'>
              {t(
                'Start with account access, fund the wallet, create an API key, then use logs, invites, and daily check-in to keep the account running.'
              )}
            </p>
          </div>
          <Button
            className='w-fit rounded-lg'
            render={
              <Link to={props.isAuthenticated ? '/dashboard' : '/sign-up'} />
            }
          >
            {props.isAuthenticated ? t('Open console') : t('Start now')}
            <ArrowRight className='ml-1 size-3.5' aria-hidden='true' />
          </Button>
        </AnimateInView>

        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
          {steps.map((step, index) => {
            const Icon = step.icon

            return (
              <AnimateInView
                key={step.title}
                delay={index * 80}
                animation='fade-up'
              >
                <Link
                  to={step.href}
                  className='bg-card hover:bg-muted/40 focus-visible:ring-ring flex h-full min-h-34 flex-col justify-between rounded-lg border p-4 text-left shadow-xs transition-colors outline-none focus-visible:ring-2'
                >
                  <span className='flex items-start justify-between gap-3'>
                    <span className='bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg'>
                      <Icon className='size-5' aria-hidden='true' />
                    </span>
                    <span className='text-muted-foreground font-mono text-xs tabular-nums'>
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  </span>
                  <span className='mt-5 flex flex-col gap-1.5'>
                    <span className='text-base font-semibold'>
                      {step.title}
                    </span>
                    <span className='text-muted-foreground text-sm leading-relaxed'>
                      {step.description}
                    </span>
                  </span>
                </Link>
              </AnimateInView>
            )
          })}
        </div>
      </div>
    </section>
  )
}
