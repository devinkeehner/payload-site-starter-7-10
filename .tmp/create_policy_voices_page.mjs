import { config as dotenvConfig } from 'dotenv'

dotenvConfig({ path: '.env.local' })
dotenvConfig()

const { default: configPromise } = await import('../src/payload.config.ts')
const { getPayload } = await import('payload')

const config = await configPromise
const payload = await getPayload({ config })

const tenantId = '68761c2ec6a201e9f6436216'
const slug = 'municipal-priorities-affordability-accountability'

const policyVoicesBlock = {
  blockType: 'policyVoices',
  title: 'Connecticut Municipalities: Affordability and Accountability',
  leftLabel: 'Affordability',
  rightLabel: 'Accountability',
  layoutMode: 'scroll',
  interactionMode: 'stage',
  cardStyleMode: 'solid',
  bubblePlacementMode: 'hybrid',
  enableBubbleFloat: true,
  enableMobileSwipeFilter: true,
  highlightDurationMs: 4500,
  scrollStageHeightVh: 95,
  enableParallax: true,
  parallaxStrength: 0.08,
  speechBubbles: [
    {
      text: 'Towns need relief from state mandates that drive up local taxes.',
      side: 'affordability',
      useAutoPosition: false,
      x: 18,
      y: 20,
      floatDelay: 0,
    },
    {
      text: 'Small businesses should get tax breathing room tied to jobs.',
      side: 'affordability',
      useAutoPosition: false,
      x: 24,
      y: 48,
      floatDelay: 0.8,
    },
    {
      text: 'Ratepayers deserve lower electric bills and more pricing discipline.',
      side: 'affordability',
      useAutoPosition: false,
      x: 20,
      y: 74,
      floatDelay: 1.6,
    },
    {
      text: 'Government should be audited with real investigative authority.',
      side: 'accountability',
      useAutoPosition: false,
      x: 80,
      y: 24,
      floatDelay: 0.4,
    },
    {
      text: 'Major utility cost overruns should come back to lawmakers.',
      side: 'accountability',
      useAutoPosition: false,
      x: 76,
      y: 52,
      floatDelay: 1.2,
    },
    {
      text: 'Budget earmarks should be transparent, trackable, and justified.',
      side: 'accountability',
      useAutoPosition: false,
      x: 82,
      y: 76,
      floatDelay: 2.0,
    },
  ],
  cards: [
    {
      title: 'HB 5008: Small Business Tax Exemption',
      description:
        'Creates a business tax exemption of $2,080 per full-time-equivalent employee for small businesses, including LLCs, pass-through entities, and sole proprietors. The goal is to offset rising labor costs and preserve local jobs.',
      side: 'affordability',
      icon: 'Building2',
      anchorId: 'hb-5008-business-tax-exemption',
      stageOrder: 1,
      stageTitle: 'Lowering Employer Costs',
    },
    {
      title: 'HB 5009: Property Tax Credit Expansion',
      description:
        'Raises the property tax credit cap from $300 to $1,000, adds a $400 minimum full-credit level for eligible incomes, and broadens eligibility thresholds. This proposal targets direct household relief from high local tax pressure.',
      side: 'affordability',
      icon: 'Home',
      anchorId: 'hb-5009-property-tax-credit',
      stageOrder: 2,
      stageTitle: 'Household Tax Relief',
    },
    {
      title: 'HB 5028: Remove Public Benefits Charge From Electric Bills',
      description:
        'Eliminates the public benefits charge on utility bills and moves funding decisions for those programs into the state budget process. This is designed to make electricity pricing clearer and reduce volatility for ratepayers.',
      side: 'affordability',
      icon: 'Zap',
      anchorId: 'hb-5028-public-benefits-charge',
      stageOrder: 3,
      stageTitle: 'Reducing Energy Burden',
    },
    {
      title: 'Cap Power Purchase Agreement Costs',
      description:
        'Would prohibit power purchase agreements that exceed 150% above wholesale electricity prices and require multistate solicitation for large clean-energy projects. The focus is controlling long-term procurement costs passed to customers.',
      side: 'affordability',
      icon: 'Receipt',
      anchorId: 'ppa-cost-cap',
      stageOrder: 4,
      stageTitle: 'Ratepayer Protection',
    },
    {
      title: 'Community Choice Aggregation for Municipalities',
      description:
        'Allows towns to procure electricity supply for residents and businesses while utilities continue transmission and distribution service. This gives municipalities a tool to negotiate better supply pricing.',
      side: 'affordability',
      icon: 'Landmark',
      anchorId: 'community-choice-aggregation',
      stageOrder: 5,
      stageTitle: 'Local Procurement Tools',
    },
    {
      title: 'HB 5010: Exempt Tips and Overtime From State Income Tax',
      description:
        'Exempts tipped wages and overtime pay from Connecticut income tax to align state treatment with recent federal changes and increase take-home pay for working households.',
      side: 'affordability',
      icon: 'DollarSign',
      anchorId: 'hb-5010-tips-overtime',
      stageOrder: 6,
      stageTitle: 'Worker Take-Home Pay',
    },
    {
      title: 'Establish a Civil Office of Inspector General',
      description:
        'Creates an independent office empowered to investigate alleged waste, fraud, corruption, and unethical conduct in state government, with authority to access records and refer findings publicly.',
      side: 'accountability',
      icon: 'Shield',
      anchorId: 'office-inspector-general',
      stageOrder: 7,
      stageTitle: 'Oversight and Integrity',
    },
    {
      title: 'Reduce Early Voting Days for Municipal Cost Relief',
      description:
        'Proposes reducing early voting windows to 7 days for general elections and 3 days for primaries to ease local staffing and operational costs, especially in smaller towns.',
      side: 'accountability',
      icon: 'Vote',
      anchorId: 'early-voting-days',
      stageOrder: 8,
      stageTitle: 'Election Operations',
    },
    {
      title: 'Require Legislative Approval for Certain PURA Cost Overruns',
      description:
        'Adds safeguards requiring legislative re-approval when utility policy implementation costs exceed stated fiscal estimates by defined thresholds, aiming to check unanticipated ratepayer impact.',
      side: 'accountability',
      icon: 'Scale',
      anchorId: 'pura-legislative-approval',
      stageOrder: 9,
      stageTitle: 'Utility Cost Governance',
    },
    {
      title: 'Set Earmark Standards for Budget Requests',
      description:
        'Requires clearer disclosure of who requested funds, expected outcomes, administrative overhead, and return on investment before grants are awarded, plus annual reporting on use of funds.',
      side: 'accountability',
      icon: 'FileCheck',
      anchorId: 'earmark-standards',
      stageOrder: 10,
      stageTitle: 'Budget Transparency',
    },
    {
      title: 'Require Timely Deposit of Volatility Funds',
      description:
        'Imposes a 30-day deadline for the Treasurer to deposit designated volatility funds to prevent delayed transfers and improve fiscal discipline in reserve management.',
      side: 'accountability',
      icon: 'Receipt',
      anchorId: 'volatility-funds-deadline',
      stageOrder: 11,
      stageTitle: 'Fiscal Controls',
    },
  ],
}

const baseData = {
  title: 'Municipal Priorities: Affordability & Accountability',
  slug,
  tenant: tenantId,
  hero: {
    type: 'none',
  },
  layout: [policyVoicesBlock],
  _status: 'published',
}

const existing = await payload.find({
  collection: 'pages',
  limit: 1,
  where: {
    and: [{ slug: { equals: slug } }, { tenant: { equals: tenantId } }],
  },
})

let result
if (existing.docs.length > 0) {
  result = await payload.update({
    collection: 'pages',
    id: existing.docs[0].id,
    data: baseData,
    overrideAccess: true,
  })
  console.log(
    JSON.stringify(
      {
        action: 'updated',
        id: result.id,
        slug: result.slug,
        status: result._status,
        cards: result.layout?.[0]?.cards?.length ?? 0,
      },
      null,
      2,
    ),
  )
} else {
  result = await payload.create({
    collection: 'pages',
    data: baseData,
    overrideAccess: true,
  })
  console.log(
    JSON.stringify(
      {
        action: 'created',
        id: result.id,
        slug: result.slug,
        status: result._status,
        cards: result.layout?.[0]?.cards?.length ?? 0,
      },
      null,
      2,
    ),
  )
}

await payload.db.destroy()
process.exit(0)
