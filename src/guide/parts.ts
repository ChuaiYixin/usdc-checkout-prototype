// The homepage's main flow: three parts, each with steps. Both languages live here because this is long-form text.
// `check` names a condition in src/guide/checks.ts that completes the step once the app's records show it happened.
// `why` says what to notice at that step and the product decision behind it.
import type { Locale } from "@/i18n/core";

export interface Text {
  en: string;
  zh: string;
}

export const pick = (text: Text, locale: Locale) => text[locale];

export interface StepLink {
  /** Used when no order from this flow is known yet. Omit to show no link in that case. */
  href?: string;
  label: Text;
  /** Link to a specific record instead: this part's newest request or order, or the order paid in part 1. */
  to?: "request" | "order" | "first-order";
  /** A way around the step rather than the way through it, so it shouldn't look like the main action. */
  fallback?: boolean;
}

export interface Step {
  text: Text;
  why?: Text;
  link?: StepLink;
  check?: string;
}

export interface Part {
  id: string;
  title: Text;
  summary: Text;
  badge: Text;
  tone: "green" | "amber" | "blue";
  minutes: number;
  steps: Step[];
}

const ORDERS: Text = { en: "Open orders", zh: "打开订单列表" };
const THIS_ORDER: Text = { en: "Open this order", zh: "打开这笔订单" };
const SIM: Text = { en: "Open the simulator", zh: "打开模拟器" };

export const PARTS: Part[] = [
  {
    id: "take-a-payment",
    title: { en: "Take a payment", zh: "收一笔款" },
    summary: {
      en: "Pay with real test USDC and follow it to the merchant, matched to the order automatically.",
      zh: "用真实的测试 USDC 付款，跟着这笔钱走到商户后台，并自动对上订单。",
    },
    badge: { en: "Real testnet", zh: "真实测试网" },
    tone: "green",
    minutes: 5,
    steps: [
      {
        text: {
          en: "Open the store. Keep United States as the country and click Pay 120.00 USDC.",
          zh: "打开商店，国家保持「美国」，点「支付 120.00 USDC」。",
        },
        link: { href: "/store", label: { en: "Open the store", zh: "打开商店" } },
        check: "order_created",
      },
      {
        text: {
          en: "On the payment page, connect a wallet: Use test wallet if you see that button, otherwise MetaMask.",
          zh: "在付款页连接钱包：有「使用测试钱包」按钮就点它，没有就用 MetaMask。",
        },
        why: {
          en: "Under Scan QR code is an address made just for this order. The address alone tells the system which order a transfer belongs to, so the buyer never has to add a memo or send a special amount.",
          zh: "「扫二维码」里是这笔订单专用的地址。只看收款地址就知道转账属于哪个订单，买家不用填备注，也不用付特殊金额。",
        },
        link: { to: "request", label: { en: "Open the payment page", zh: "打开付款页" } },
        check: "wallet_connected",
      },
      {
        text: {
          en: "Click Pay 120.00 USDC — no gas needed, and sign if your wallet asks.",
          zh: "点「支付 120.00 USDC（无需 Gas）」，钱包要求时签名。",
        },
        why: {
          en: "The buyer only signs. The platform submits the transaction and pays the network fee, and only for the exact amount going to this order's address. A buyer with USDC but no ETH can still pay.",
          zh: "买家只需要签名，由平台提交交易并支付手续费，而且只代付「金额正好、地址正好」的授权。手里有 USDC 但没有 ETH 的买家也能付款。",
        },
        link: { href: "/ops/simulator", fallback: true, label: { en: "No test USDC? Use the simulator's Exact payment", zh: "没有测试币？用模拟器的「付款金额正确」" } },
        check: "payment_detected",
      },
      {
        text: {
          en: "Watch the page change on its own to Payment successful.",
          zh: "看页面自动变成「支付成功」。",
        },
        why: {
          en: "This takes seconds, because the buyer only needs to know it worked. On a real payment, the transaction link opens it on Basescan.",
          zh: "这一步只要几秒，因为买家只需要知道付款成功了。如果是真实付款，点交易链接可以在 Basescan 上查看。",
        },
        link: { to: "request", label: { en: "Open the payment page", zh: "打开付款页" } },
        check: "payment_succeeded",
      },
      {
        text: {
          en: "Open the order in the merchant dashboard. The transaction hash is the same and nobody matched it by hand. Stay 1–2 minutes until Funds changes from Pending finality to Available.",
          zh: "在商户后台打开这笔订单。交易哈希一致，全程没有人工匹配。再等 1–2 分钟，直到「资金」从「待最终确认」变成「可用」。",
        },
        why: {
          en: "Buyer and merchant wait for different things. A recently added block can still be undone, and that risk sits with the platform and merchant, so the buyer gets a fast answer while the money is held back a little longer.",
          zh: "买家和商户等的不是同一件事。很新的区块还可能被回滚，这个风险由平台和商户承担，所以买家先得到快速反馈，资金则晚一点才放行。",
        },
        link: { href: "/merchant/orders", to: "order", label: THIS_ORDER },
        check: "funds_available",
      },
    ],
  },
  {
    id: "when-it-goes-wrong",
    title: { en: "Handle a payment that goes wrong", zh: "处理出问题的付款" },
    summary: {
      en: "An underpayment and a payment from a flagged wallet: what each person sees, and who decides.",
      zh: "一笔少付、一笔来自风险钱包的付款：每个角色看到什么，由谁来决定。",
    },
    badge: { en: "Simulator", zh: "模拟器" },
    tone: "amber",
    minutes: 4,
    steps: [
      {
        text: {
          en: "In the simulator, click New demo order, then Underpay (−25%) on the new order.",
          zh: "在模拟器里点「新建演示订单」，然后对新订单点「少付（−25%）」。",
        },
        why: {
          en: "On-chain transfers can't be reversed, so the rule for each mistake is decided in advance rather than left to a support agent.",
          zh: "链上转账不可撤销，所以每种错误的处理规则要事先定好，不能留给客服临时判断。",
        },
        link: { href: "/ops/simulator", label: SIM },
        check: "underpaid_seen",
      },
      {
        text: {
          en: "Click Buyer view to see how much is still due. Then, back in the simulator, click Top up remainder.",
          zh: "点「买家视角」，看看还差多少。然后回到模拟器，点「补足差额」。",
        },
        why: {
          en: "Both transfers count toward the same order. If the buyer never tops up, the partial payment goes to the exception queue, with a full refund as the default.",
          zh: "两笔转账合并计入同一个订单。如果买家一直不补，已付部分会进入异常队列，默认全额退回。",
        },
        link: { href: "/ops/simulator", label: SIM },
        check: "topped_up",
      },
      {
        text: {
          en: "Create one more demo order and click Payer on risk list.",
          zh: "再新建一个演示订单，点「付款人在风险名单上」。",
        },
        why: {
          en: "Screening runs before the money reaches the merchant's balance.",
          zh: "筛查发生在这笔钱进入商户余额之前。",
        },
        link: { href: "/ops/simulator", label: SIM },
        check: "screening_hit",
      },
      {
        text: {
          en: "Open that order: it's Under review, Funds are Frozen, and there's no refund button. In the simulator, Buyer view only says the payment is processing.",
          zh: "打开这笔订单：状态是「审核中」，资金「已冻结」，也没有退款按钮。在模拟器里点「买家视角」，页面只显示「处理中」。",
        },
        why: {
          en: "Telling the buyer would warn someone who may be moving illicit funds, and a refund would send the money back to the flagged address. The cost is a confusing wait for an honest buyer caught by a false match.",
          zh: "告诉买家，等于提醒可能在转移非法资金的人；退款则等于把钱还给被标记的地址。代价是被误伤的正常买家只能困惑地等待。",
        },
        link: { href: "/merchant/orders", to: "order", label: THIS_ORDER },
      },
      {
        text: {
          en: "In the exception queue, choose Keep frozen & file report, or Release (false positive).",
          zh: "在异常队列里选择「保持冻结并上报」或「放行（误报）」。",
        },
        why: {
          en: "This call belongs to compliance, not the merchant.",
          zh: "这个决定属于合规团队，不属于商户。",
        },
        link: { href: "/ops/exceptions", label: { en: "Open the exception queue", zh: "打开异常队列" } },
        check: "screening_handled",
      },
    ],
  },
  {
    id: "money-out",
    title: { en: "Refund, settle and reconcile", zh: "退款、结算、对账" },
    summary: {
      en: "Give money back, convert the rest to SGD, and check that the books add up.",
      zh: "把钱退回去，把其余的换成新元，再确认账目对得上。",
    },
    badge: { en: "Real refund, simulated FX and bank", zh: "退款真实，换汇和银行为模拟" },
    tone: "blue",
    minutes: 4,
    steps: [
      {
        text: {
          en: "Open the order you paid in part 1 and click Refund in full. Any paid order whose Funds isn't Settled also works.",
          zh: "打开第一部分付款的订单，点「全额退款」。其他资金不是「已结算」的已付款订单也可以。",
        },
        why: {
          en: "There's nowhere to type another address, because “refund somewhere else” is a classic path for fraud and laundering. The cost: a buyer who paid from an exchange's shared wallet may not get the refund, which is still an open question in the PRD.",
          zh: "这里没有地方可以填别的地址，因为「退到另一个地址」是欺诈和洗钱的经典路径。代价是从交易所共用钱包付款的买家可能收不到退款，这仍是 PRD 里的开放问题。",
        },
        link: { href: "/merchant/orders", to: "first-order", label: { en: "Open the order", zh: "打开订单" } },
        check: "refund_done",
      },
      {
        text: {
          en: "On Settlement, read the conversion preview: rate, spread and what you'll receive. Then click Run today's settlement now. If nothing is available yet, wait 1–2 minutes for the order you topped up in part 2.",
          zh: "在结算页看换汇预览：汇率、点差和实收金额。然后点「立即运行今日结算」。如果提示还没有可结算的资金，等 1–2 分钟，让第二部分补款的订单到账。",
        },
        why: {
          en: "These merchants pay rent and salaries in SGD, so daily conversion is the default. Once an order is settled, its Refund button is gone, because that money has already left as SGD.",
          zh: "这些商户的房租和工资都用新元，所以默认每日换汇。订单结算后退款按钮就没有了，因为这笔钱已经换成新元打出去了。",
        },
        link: { href: "/merchant/settlement", label: { en: "Open settlement", zh: "打开结算页" } },
        check: "settlement_run",
      },
      {
        text: {
          en: "On Reconciliation, find your new batch at the top. Each order is matched across chain, FX and bank.",
          zh: "在对账页最上方找到你的新批次。每笔订单都在链上、换汇、银行三列对上了。",
        },
        link: { href: "/merchant/reconciliation", label: { en: "Open reconciliation", zh: "打开对账页" } },
      },
      {
        text: {
          en: "Scroll to the two red batches. In one, the bank credited less than expected. In the other, an order is missing from the FX batch.",
          zh: "往下找到两个标红的批次。一个是银行入账比预期少，另一个是有笔订单不在换汇批次里。",
        },
        why: {
          en: "The red flag means someone sees the problem the same day rather than at month-end. These two batches are sample data.",
          zh: "标红的意义在于当天就有人看到问题，而不是拖到月底。这两个批次是示例数据。",
        },
        link: { href: "/merchant/reconciliation", label: { en: "Open reconciliation", zh: "打开对账页" } },
      },
    ],
  },
];

export const getPart = (id: string) => PARTS.find((p) => p.id === id);
