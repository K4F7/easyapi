/*
Copyright (C) 2025 QuantumNous

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

import React, { useMemo, useState } from 'react';
import {
  IconBook,
  IconCheckCircle,
  IconChevronRight,
  IconCode,
  IconCopy,
  IconKey,
  IconMonitor,
  IconSetting,
} from '@douyinfe/semi-icons';
import { Button, Card, Typography } from '@douyinfe/semi-ui';

const { Title, Text, Paragraph } = Typography;

const API_KEY_PLACEHOLDER = 'sk-你的 API 密钥';
const BASE_URL_PLACEHOLDER = 'https://easyapi.work/v1';

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
];

const codexCommands = {
  macos: `npm install -g @openai/codex
# 或
brew install codex`,
  windows: `npm install -g @openai/codex
# 如 npm 不可用，请先安装 Node.js LTS`,
};

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <Button
      size='small'
      theme='borderless'
      icon={copied ? <IconCheckCircle /> : <IconCopy />}
      onClick={handleCopy}
      className='!absolute top-3 right-3 !text-white/90 hover:!bg-white/10'
    >
      {copied ? 'Copied' : null}
    </Button>
  );
}

function CodeBlock({ code }) {
  return (
    <div className='relative overflow-hidden rounded-xl bg-[#111827] shadow-sm ring-1 ring-black/10'>
      <CopyButton text={code} />
      <pre className='m-0 overflow-x-auto p-5 pr-16 text-sm leading-7 text-slate-100'>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function Note({ children }) {
  return (
    <div className='rounded-r-lg border-l-2 border-semi-color-primary bg-semi-color-bg-1 px-5 py-4 text-sm leading-7 text-semi-color-text-1 shadow-sm ring-1 ring-semi-color-border'>
      {children}
    </div>
  );
}

function StepTitle({ index, title }) {
  return (
    <div className='space-y-2'>
      <div className='font-mono text-xs font-semibold tracking-[0.24em] text-semi-color-text-2'>
        {index}
      </div>
      <Title heading={2} className='!m-0 !text-2xl md:!text-3xl'>
        {title}
      </Title>
    </div>
  );
}

function PlatformTabs({ active, onChange }) {
  const platforms = [
    { key: 'macos', label: 'macOS / Linux' },
    { key: 'windows', label: 'Windows' },
  ];

  return (
    <div className='inline-flex rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-1'>
      {platforms.map((item) => (
        <button
          key={item.key}
          type='button'
          onClick={() => onChange(item.key)}
          className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors ${
            active === item.key
              ? 'bg-semi-color-bg-0 text-semi-color-text-0 shadow-sm'
              : 'text-semi-color-text-2 hover:text-semi-color-text-0'
          }`}
        >
          <IconMonitor />
          {item.label}
        </button>
      ))}
    </div>
  );
}

function InlineValue({ children }) {
  return (
    <code className='rounded-md bg-semi-color-fill-0 px-1.5 py-0.5 font-mono text-sm text-semi-color-text-0'>
      {children}
    </code>
  );
}

function FeatureCard({ icon, title, description }) {
  return (
    <Card className='h-full !rounded-2xl !border-semi-color-border !bg-semi-color-bg-1 !shadow-sm'>
      <div className='mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-semi-color-fill-0 text-semi-color-text-0'>
        {icon}
      </div>
      <Title heading={5} className='!m-0'>
        {title}
      </Title>
      <Paragraph className='!mt-2 !mb-0 !text-sm !leading-6 !text-semi-color-text-1'>
        {description}
      </Paragraph>
    </Card>
  );
}

function DocsSidebar() {
  return (
    <aside className='hidden w-56 shrink-0 lg:block'>
      <div className='sticky top-28 border-l border-semi-color-border pl-5'>
        <p className='mb-5 text-xs font-semibold tracking-[0.2em] text-semi-color-text-2'>
          本页目录
        </p>
        <nav className='space-y-3 text-sm'>
          {toc.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className='block text-semi-color-text-2 transition-colors hover:text-semi-color-primary'
            >
              {item.title}
            </a>
          ))}
        </nav>
      </div>
    </aside>
  );
}

function Breadcrumb() {
  return (
    <div className='mb-4 flex items-center gap-1 text-sm text-semi-color-text-2'>
      <span>文档</span>
      <IconChevronRight />
      <span className='text-semi-color-text-0'>AI 客户端接入教程</span>
    </div>
  );
}

function SectionCard({ children }) {
  return (
    <div className='rounded-xl border border-semi-color-border bg-semi-color-bg-1 p-5'>
      {children}
    </div>
  );
}

const Docs = () => {
  const [platform, setPlatform] = useState('windows');
  const codexConfig = useMemo(
    () =>
      `export OPENAI_API_KEY="${API_KEY_PLACEHOLDER}"
export OPENAI_BASE_URL="${BASE_URL_PLACEHOLDER}"

codex`,
    [],
  );
  const codexPowerShellConfig = useMemo(
    () =>
      `$env:OPENAI_API_KEY="${API_KEY_PLACEHOLDER}"
$env:OPENAI_BASE_URL="${BASE_URL_PLACEHOLDER}"

codex`,
    [],
  );

  return (
    <main className='min-h-[calc(100vh-64px)] overflow-y-auto border-t border-semi-color-border bg-semi-color-bg-0 pt-20'>
      <div className='mx-auto flex max-w-7xl gap-12 px-6 py-10 md:px-10'>
        <DocsSidebar />

        <article className='min-w-0 flex-1 pb-16'>
          <Breadcrumb />
          <header id='overview' className='border-b border-semi-color-border pb-8'>
            <Title heading={1} className='!m-0 !text-3xl md:!text-4xl'>
              AI 客户端接入指南
            </Title>
            <Paragraph className='!mt-4 !mb-0 max-w-3xl !text-base !leading-8 !text-semi-color-text-1'>
              本教程用于将云端 API 服务接入 Codex CLI 与 Cherry Studio。
              你只需要准备一个可用的 API 密钥，并将接口地址填写为{' '}
              <InlineValue>{BASE_URL_PLACEHOLDER}</InlineValue>。
            </Paragraph>
            <div className='mt-8 grid gap-4 md:grid-cols-3'>
              <FeatureCard
                icon={<IconCode size='large' />}
                title='Codex CLI'
                description='适合在终端、代码仓库与开发环境中快速调用模型。'
              />
              <FeatureCard
                icon={<IconSetting size='large' />}
                title='Cherry Studio'
                description='适合桌面端对话、模型管理、多供应商配置与日常使用。'
              />
              <FeatureCard
                icon={<IconKey size='large' />}
                title='统一凭证'
                description='两个客户端均使用同一个 Base URL 与 API Key。'
              />
            </div>
          </header>

          <section id='codex' className='scroll-mt-28 py-10'>
            <div className='mb-8 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between'>
              <div>
                <div className='mb-2 flex items-center gap-2 text-sm font-semibold text-semi-color-text-2'>
                  <IconBook />
                  Codex 教程
                </div>
                <Title heading={2} className='!m-0 !text-2xl md:!text-3xl'>
                  接入 Codex CLI
                </Title>
              </div>
              <PlatformTabs active={platform} onChange={setPlatform} />
            </div>

            <Note>
              官方原版安装：以下流程使用官方 Codex CLI，并通过 OpenAI
              兼容接口转发到你的云端服务。
            </Note>
          </section>

          <section id='codex-install' className='scroll-mt-28 space-y-5 border-t border-semi-color-border py-10'>
            <StepTitle index='01' title='安装 Codex CLI' />
            <Text type='tertiary'>运行以下任一命令全局安装 Codex CLI：</Text>
            <CodeBlock code={codexCommands[platform]} />
            <Note>如果提示权限不足，请使用管理员终端，或检查 Node.js 与 npm 是否已正确安装。</Note>
          </section>

          <section id='codex-auth' className='scroll-mt-28 space-y-5 border-t border-semi-color-border py-10'>
            <StepTitle index='02' title='配置 API 密钥与接口地址' />
            <Paragraph className='!m-0 !leading-7 !text-semi-color-text-1'>
              将 <InlineValue>OPENAI_API_KEY</InlineValue> 设置为你的密钥，将{' '}
              <InlineValue>OPENAI_BASE_URL</InlineValue> 设置为云端服务的 OpenAI
              兼容地址。
            </Paragraph>
            <CodeBlock code={platform === 'windows' ? codexPowerShellConfig : codexConfig} />
          </section>

          <section id='codex-run' className='scroll-mt-28 space-y-5 border-t border-semi-color-border py-10'>
            <StepTitle index='03' title='开始使用' />
            <Paragraph className='!m-0 !leading-7 !text-semi-color-text-1'>
              在项目目录中执行 <InlineValue>codex</InlineValue>，按提示选择模型并开始对话。
              如果需要固定模型，请在 Codex 的配置中填入你站点可用的模型名称。
            </Paragraph>
            <SectionCard>
              <div className='flex items-center gap-3 text-sm font-semibold text-semi-color-text-0'>
                <IconCheckCircle className='text-emerald-500' />
                验证成功标志
              </div>
              <p className='mt-3 mb-0 text-sm leading-7 text-semi-color-text-1'>
                能够正常返回模型响应，且后台日志中出现对应请求记录，即表示 Codex 已接入成功。
              </p>
            </SectionCard>
          </section>

          <section id='cherry' className='scroll-mt-28 space-y-5 border-t border-semi-color-border py-10'>
            <div className='mb-2 flex items-center gap-2 text-sm font-semibold text-semi-color-text-2'>
              <IconSetting />
              Cherry Studio 教程
            </div>
            <StepTitle index='04' title='接入 Cherry Studio' />
            <Note>
              Cherry Studio 使用 OpenAI 兼容服务商配置即可接入。请先在后台创建 API 密钥，
              并确认你的云端域名可以从本机正常访问。
            </Note>
          </section>

          <section id='cherry-provider' className='scroll-mt-28 space-y-5 border-t border-semi-color-border py-10'>
            <StepTitle index='05' title='添加服务商' />
            <ol className='space-y-4 pl-0 text-sm leading-7 text-semi-color-text-1'>
              <li className='list-none rounded-xl border border-semi-color-border bg-semi-color-bg-1 p-4'>
                打开 Cherry Studio，进入 <InlineValue>设置</InlineValue> →{' '}
                <InlineValue>模型服务</InlineValue>。
              </li>
              <li className='list-none rounded-xl border border-semi-color-border bg-semi-color-bg-1 p-4'>
                新增服务商，类型选择 <InlineValue>OpenAI Compatible</InlineValue> 或{' '}
                <InlineValue>OpenAI</InlineValue>。
              </li>
              <li className='list-none rounded-xl border border-semi-color-border bg-semi-color-bg-1 p-4'>
                API Key 填写 <InlineValue>{API_KEY_PLACEHOLDER}</InlineValue>，API
                Host/Base URL 填写 <InlineValue>{BASE_URL_PLACEHOLDER}</InlineValue>。
              </li>
            </ol>
          </section>

          <section id='cherry-model' className='scroll-mt-28 space-y-5 border-t border-semi-color-border py-10'>
            <StepTitle index='06' title='添加模型并测试' />
            <Paragraph className='!m-0 !leading-7 !text-semi-color-text-1'>
              在服务商下添加你后台已启用的模型名称，例如 <InlineValue>gpt-4o</InlineValue>、
              <InlineValue>claude-sonnet-4-5</InlineValue> 或其他自定义模型名。保存后新建会话，
              选择该服务商与模型发送一句测试消息。
            </Paragraph>
            <CodeBlock
              code={`服务商类型：OpenAI Compatible
API Key：${API_KEY_PLACEHOLDER}
Base URL：${BASE_URL_PLACEHOLDER}
模型名称：填写后台可用模型名`}
            />
          </section>

          <section id='troubleshooting' className='scroll-mt-28 space-y-5 border-t border-semi-color-border py-10'>
            <StepTitle index='07' title='常见问题' />
            <div className='grid gap-4'>
              {[
                ['401 或鉴权失败', '检查 API Key 是否复制完整，密钥前后不要包含空格。'],
                ['404 或模型不存在', '确认 Cherry Studio/Codex 中填写的模型名已在后台启用。'],
                ['连接失败', '确认 Base URL 包含 /v1，且云端反向代理已正确转发 HTTPS 请求。'],
                ['没有用量日志', '检查客户端是否真的请求了当前云端地址，而不是默认官方地址。'],
              ].map(([title, description]) => (
                <SectionCard key={title}>
                  <Title heading={5} className='!m-0'>
                    {title}
                  </Title>
                  <p className='mt-2 mb-0 text-sm leading-7 text-semi-color-text-1'>
                    {description}
                  </p>
                </SectionCard>
              ))}
            </div>
          </section>
        </article>
      </div>
    </main>
  );
};

export default Docs;
