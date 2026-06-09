import { z } from "zod";

type ChannelTierId = "auto" | "low" | "activity" | "standard" | "premium";

type ChannelTierBase = {
  id: ChannelTierId;
  label: string;
  defaultGroup: string;
  stability: string;
  description: string;
  default?: true;
};

const channelTierBases = [
  {
    id: "auto",
    label: "自动选择",
    defaultGroup: "auto",
    stability: "自动跳组",
    description: "自动选择，从低价到高价逐级选择。",
  },
  {
    id: "low",
    label: "低价渠道",
    defaultGroup: "budget",
    stability: "~50% 在线",
    description: "低成本，适合非关键任务或可重试场景。",
  },
  {
    id: "activity",
    label: "活动分组",
    defaultGroup: "free",
    stability: "极低价格",
    description: "偶尔会有，请关注群组了解什么时候会有。",
  },
  {
    id: "standard",
    label: "一般渠道",
    defaultGroup: "normal",
    stability: "~80% 在线",
    description: "默认推荐，适合日常开发与一般业务调用。",
    default: true,
  },
  {
    id: "premium",
    label: "高价渠道",
    defaultGroup: "stable",
    stability: "~99.9% 在线",
    description: "高稳定性，适合关键业务和生产调用。",
  },
] as const satisfies readonly ChannelTierBase[];

const channelGroupEnvById: Record<ChannelTierId, string> = {
  auto: "NEWAPI_CHANNEL_GROUP_AUTO",
  low: "NEWAPI_CHANNEL_GROUP_LOW",
  activity: "NEWAPI_CHANNEL_GROUP_ACTIVITY",
  standard: "NEWAPI_CHANNEL_GROUP_STANDARD",
  premium: "NEWAPI_CHANNEL_GROUP_PREMIUM",
};

export const channelTiers = channelTierBases.map((tier) => ({
  id: tier.id,
  label: tier.label,
  group: parseChannelGroupEnv(channelGroupEnvById[tier.id], tier.defaultGroup),
  stability: tier.stability,
  description: tier.description,
  ...("default" in tier ? { default: tier.default } : {}),
}));

export type ChannelTier = (typeof channelTiers)[number];
export type ChannelGroup = ChannelTier["group"];

const channelGroups = channelTiers.map((tier) => tier.group) as [
  ChannelGroup,
  ...ChannelGroup[],
];
const channelGroupSet = new Set<string>(channelGroups);

export const channelGroupSchema = z.custom<ChannelGroup>(
  (value) => typeof value === "string" && channelGroupSet.has(value),
  {
    message: "请选择有效的渠道档位",
  },
);

export const defaultChannelTier =
  channelTiers.find((tier) => "default" in tier && tier.default) ??
  channelTiers[0];
export const defaultChannelGroup = defaultChannelTier.group;

export function isChannelGroup(value: string): value is ChannelGroup {
  return channelGroupSet.has(value);
}

function parseChannelGroupEnv(key: string, fallback: string): string {
  const value = process.env[key]?.trim();
  return value || fallback;
}
