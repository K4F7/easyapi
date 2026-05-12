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
import { useMemo, useState } from 'react'
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Code2,
  Copy,
  KeyRound,
  Monitor,
  Settings2,
  Terminal,
} from 'lucide-react'
import { PublicLayout } from '@/components/layout'

const API_KEY_PLACEHOLDER = 'sk-你的 API 密钥'
const BASE_URL_PLACEHOLDER = 'https://你的域名/v1'

const toc = [
  { id: 'overview', title: '概览' },
  { id: 'codex', title: '接入 Codex' },
  { id: 'codex-install', title: '安装 Codex CLI' },
  { id: 'codex-auth', title: '配置 API 密钥' },
  { id: 'codex-run', title: '开始使用' },
  { id: 'cherry', title: '接入 Cherry Studio' },
  { id: 'cherry-provider', title: '添加服务商' },
  { id: 'cherry-model', title: '添加模型' },
  { id: 'troubleshooting', title: '常见问题' },
]

const codexCommands = {
  macos: `npm install -g @openai/codex
# 或
brew install codex`,
  windows: `npm install -g @openai/codex
# 如 npm 不可用，请先安装 Node.js LTS`,
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <button
      type='button'
      onClick={handleCopy}
      className='bg-muted/20 hover:bg-muted/30 absolute top-3 right-3 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors'
    >
      {copied ? 'Copied' : <Copy className='h-3.5 w-3.5' />}
    </button>
  )
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className='relative overflow-hidden rounded-xl bg-slate-900 shadow-sm ring-1 ring-black/10'>
      <CopyButton text={code} />
      <pre className='overflow-x-auto p-5 pr-16 text-sm leading-7 text-slate-100'>
        <code>{code}</code>
      </pre>
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className='border-l-2 border-foreground rounded-r-lg bg-card px-5 py-4 text-sm leading-7 text-muted-foreground shadow-sm ring-1 ring-border'>
      {children}
    </div>
  )
}

function StepTitle({ index, title }: { index: string; title: string }) {
  return (
    <div className='space-y-2'>
      <div className='font-mono text-xs font-semibold tracking-[0.24em] text-muted-foreground'>
        {index}
      </div>
      <h2 className='text-2xl font-semibold tracking-tight text-foreground md:text-3xl'>
        {title}
      </h2>
    </div>
  )
}

function PlatformTabs({
  active,
  onChange,
}: {
  active: 'macos' | 'windows'
  onChange: (value: 'macos' | 'windows') => void
}) {
  return (
    <div className='inline-flex rounded-xl border border-border bg-muted/40 p-1'>
      <button
        type='button'
        onClick={() => onChange('macos')}
        className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors ${active === 'macos' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
      >
        <Monitor className='h-4 w-4' />
        macOS / Linux
      </button>
      <button
        type='button'
        onClick={() => onChange('windows')}
        className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors ${active === 'windows' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
      >
        <Monitor className='h-4 w-4' />
        Windows
      </button>
    </div>
  )
}

function InlineValue({ children }: { children: React.ReactNode }) {
  return (
    <code className='rounded-md bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground'>
      {children}
    </code>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className='rounded-2xl border border-border bg-card p-5 shadow-sm'>
      <div className='mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground'>
        {icon}
      </div>
      <h3 className='font-semibold text-foreground'>{title}</h3>
      <p className='mt-2 text-sm leading-6 text-muted-foreground'>{description}</p>
    </div>
  )
}

function DocsSidebar() {
  return (
    <aside className='hidden w-56 shrink-0 lg:block'>
      <div className='sticky top-28 border-l border-border pl-5'>
        <p className='mb-5 text-xs font-semibold tracking-[0.2em] text-muted-foreground'>
          本页目录
        </p>
        <nav className='space-y-3 text-sm'>
          {toc.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className='block text-muted-foreground transition-colors hover:text-foreground'
            >
              {item.title}
            </a>
          ))}
        </nav>
      </div>
    </aside>
  )
}

function Breadcrumb() {
  return (
    <div className='mb-4 flex items-center gap-1 text-sm text-muted-foreground'>
      <span>文档</span>
      <ChevronRight className='h-4 w-4' />
      <span className='text-foreground'>AI 客户端接入教程</span>
    </div>
  )
}

export function Docs() {
  const [platform, setPlatform] = useState<'macos' | 'windows'>('windows')
  const codexConfig = useMemo(
    () =>
      `export OPENAI_API_KEY="${API_KEY_PLACEHOLDER}"
export OPENAI_BASE_URL="${BASE_URL_PLACEHOLDER}"

codex`,
    []
  )
  const codexPowerShellConfig = useMemo(
    () =>
      `$env:OPENAI_API_KEY="${API_KEY_PLACEHOLDER}"
$env:OPENAI_BASE_URL="${BASE_URL_PLACEHOLDER}"

codex`,
    []
  )

  return (
    <PublicLayout showMainContainer={false}>
      <main className='min-h-svh border-t border-border bg-background pt-24'>
        <div className='mx-auto flex max-w-7xl gap-12 px-6 py-10 md:px-10'>
          <DocsSidebar />

          <article className='min-w-0 flex-1 pb-24'>
            <Breadcrumb />
            <header id='overview' className='border-b border-border pb-8'>
              <h1 className='text-3xl font-bold tracking-tight text-foreground md:text-4xl'>
                AI 客户端接入指南
              </h1>
              <p className='mt-4 max-w-3xl text-base leading-8 text-muted-foreground'>
                本教程用于将云端 API 服务接入 Codex CLI 与 Cherry Studio。
                你只需要准备一个可用的 API 密钥，并将接口地址填写为{' '}
                <InlineValue>{BASE_URL_PLACEHOLDER}</InlineValue>。
              </p>
              <div className='mt-8 grid gap-4 md:grid-cols-3'>
                <FeatureCard
                  icon={<Terminal className='h-5 w-5' />}
                  title='Codex CLI'
                  description='适合在终端、代码仓库与开发环境中快速调用模型。'
                />
                <FeatureCard
                  icon={<Settings2 className='h-5 w-5' />}
                  title='Cherry Studio'
                  description='适合桌面端对话、模型管理、多供应商配置与日常使用。'
                />
                <FeatureCard
                  icon={<KeyRound className='h-5 w-5' />}
                  title='统一凭证'
                  description='两个客户端均使用同一个 Base URL 与 API Key。'
                />
              </div>
            </header>

            <section id='codex' className='scroll-mt-28 py-10'>
              <div className='mb-8 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between'>
                <div>
                  <div className='mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground'>
                    <BookOpen className='h-4 w-4' />
                    Codex 教程
                  </div>
                  <h2 className='text-2xl font-semibold tracking-tight md:text-3xl'>
                    接入 Codex CLI
                  </h2>
                </div>
                <PlatformTabs active={platform} onChange={setPlatform} />
              </div>

              <Note>
                官方原版安装：以下流程使用官方 Codex CLI，并通过 OpenAI
                兼容接口转发到你的云端服务。
              </Note>
            </section>

            <section id='codex-install' className='scroll-mt-28 space-y-5 border-t border-border py-10'>
              <StepTitle index='01' title='安装 Codex CLI' />
              <p className='text-muted-foreground'>
                运行以下任一命令全局安装 Codex CLI：
              </p>
              <CodeBlock code={codexCommands[platform]} />
              <Note>如果提示权限不足，请使用管理员终端，或检查 Node.js 与 npm 是否已正确安装。</Note>
            </section>

            <section id='codex-auth' className='scroll-mt-28 space-y-5 border-t border-border py-10'>
              <StepTitle index='02' title='配置 API 密钥与接口地址' />
              <p className='leading-7 text-muted-foreground'>
                将 <InlineValue>OPENAI_API_KEY</InlineValue> 设置为你的密钥，将{' '}
                <InlineValue>OPENAI_BASE_URL</InlineValue> 设置为云端服务的 OpenAI
                兼容地址。
              </p>
              <CodeBlock
                code={platform === 'windows' ? codexPowerShellConfig : codexConfig}
              />
            </section>

            <section id='codex-run' className='scroll-mt-28 space-y-5 border-t border-border py-10'>
              <StepTitle index='03' title='开始使用' />
              <p className='leading-7 text-muted-foreground'>
                在项目目录中执行 <InlineValue>codex</InlineValue>，按提示选择模型并开始对话。
                如果需要固定模型，请在 Codex 的配置中填入你站点可用的模型名称。
              </p>
              <div className='rounded-xl border border-border bg-card p-5'>
                <div className='flex items-center gap-3 text-sm font-semibold text-foreground'>
                  <CheckCircle2 className='h-5 w-5 text-emerald-500' />
                  验证成功标志
                </div>
                <p className='mt-3 text-sm leading-7 text-muted-foreground'>
                  能够正常返回模型响应，且后台日志中出现对应请求记录，即表示 Codex 已接入成功。
                </p>
              </div>
            </section>

            <section id='cherry' className='scroll-mt-28 space-y-5 border-t border-border py-10'>
              <div className='mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground'>
                <Settings2 className='h-4 w-4' />
                Cherry Studio 教程
              </div>
              <StepTitle index='04' title='接入 Cherry Studio' />
              <Note>
                Cherry Studio 使用 OpenAI 兼容服务商配置即可接入。请先在后台创建 API 密钥，
                并确认你的云端域名可以从本机正常访问。
              </Note>
            </section>

            <section id='cherry-provider' className='scroll-mt-28 space-y-5 border-t border-border py-10'>
              <StepTitle index='05' title='添加服务商' />
              <ol className='space-y-4 text-sm leading-7 text-muted-foreground'>
                <li className='rounded-xl border border-border bg-card p-4'>
                  打开 Cherry Studio，进入 <InlineValue>设置</InlineValue> →{' '}
                  <InlineValue>模型服务</InlineValue>。
                </li>
                <li className='rounded-xl border border-border bg-card p-4'>
                  新增服务商，类型选择 <InlineValue>OpenAI Compatible</InlineValue> 或{' '}
                  <InlineValue>OpenAI</InlineValue>。
                </li>
                <li className='rounded-xl border border-border bg-card p-4'>
                  API Key 填写 <InlineValue>{API_KEY_PLACEHOLDER}</InlineValue>，API
                  Host/Base URL 填写 <InlineValue>{BASE_URL_PLACEHOLDER}</InlineValue>。
                </li>
              </ol>
            </section>

            <section id='cherry-model' className='scroll-mt-28 space-y-5 border-t border-border py-10'>
              <StepTitle index='06' title='添加模型并测试' />
              <p className='leading-7 text-muted-foreground'>
                在服务商下添加你后台已启用的模型名称，例如 <InlineValue>gpt-4o</InlineValue>、
                <InlineValue>claude-sonnet-4-5</InlineValue> 或其他自定义模型名。保存后新建会话，
                选择该服务商与模型发送一句测试消息。
              </p>
              <CodeBlock
                code={`服务商类型：OpenAI Compatible
API Key：${API_KEY_PLACEHOLDER}
Base URL：${BASE_URL_PLACEHOLDER}
模型名称：填写后台可用模型名`}
              />
            </section>

            <section id='troubleshooting' className='scroll-mt-28 space-y-5 border-t border-border py-10'>
              <StepTitle index='07' title='常见问题' />
              <div className='grid gap-4'>
                {[
                  ['401 或鉴权失败', '检查 API Key 是否复制完整，密钥前后不要包含空格。'],
                  ['404 或模型不存在', '确认 Cherry Studio/Codex 中填写的模型名已在后台启用。'],
                  ['连接失败', '确认 Base URL 包含 /v1，且云端反向代理已正确转发 HTTPS 请求。'],
                  ['没有用量日志', '检查客户端是否真的请求了当前云端地址，而不是默认官方地址。'],
                ].map(([title, description]) => (
                  <div key={title} className='rounded-xl border border-border bg-card p-5'>
                    <h3 className='font-semibold text-foreground'>{title}</h3>
                    <p className='mt-2 text-sm leading-7 text-muted-foreground'>
                      {description}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </article>
        </div>
      </main>
    </PublicLayout>
  )
}
