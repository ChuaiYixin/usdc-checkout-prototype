// The first-run tour: three flows, each made of steps. Each step points at one element on one page.
// Both languages live here because this is long-form text.
import type { Locale } from "@/i18n/core";

export interface Text {
  en: string;
  zh: string;
}

export const pick = (text: Text, locale: Locale) => text[locale];

/** Where a step opens, when it isn't on the page the person is already on. */
export interface StepRoute {
  href: string;
  /** Use this flow's newest request or order, or the order paid in flow 1, once it's known. */
  to?: "request" | "order" | "first-order";
  label: Text;
}

export interface Step {
  stage: number;
  title: Text;
  text: Text;
  /** What to notice here, and the decision behind it. */
  why?: Text;
  /** Pathname this step happens on. Elsewhere the card offers `route`. */
  page?: string;
  route?: StepRoute;
  /** `data-guide` value of the element to light up. `{order}` becomes this flow's newest order. */
  target?: string;
  /** Moves on when the app's records show it (`check`), when the page changes (`path`), or on the Next button. */
  until: { check: string } | { path: string } | "next";
  /** Show the route as the card's action even on the step's own page. */
  cta?: boolean;
  /** Waiting on the network: lift the mask so the page stays usable. */
  waiting?: boolean;
}

export interface Part {
  id: string;
  title: Text;
  summary: Text;
  minutes: number;
  stages: Text[];
  steps: Step[];
}

const CONSOLE = "^/(merchant|ops)";
const ORDER_PAGE = "^/merchant/orders/ORD";
const TO_CONSOLE: StepRoute = { href: "/merchant", label: { en: "Open the dashboard", zh: "打开控制台" } };
const TO_SCENARIOS: StepRoute = { href: "/ops/scenarios", label: { en: "Open scenarios", zh: "打开付款场景" } };

export const PARTS: Part[] = [
  {
    id: "take-a-payment",
    title: { en: "Take your first payment", zh: "收第一笔款" },
    summary: { en: "Pay with USDC at your own checkout and watch it reach your dashboard, matched to the order.", zh: "在自己的结账页用 USDC 付款，看它到达控制台并自动对上订单。" },
    minutes: 3,
    stages: [
      { en: "Order", zh: "下单" },
      { en: "Wallet", zh: "连钱包" },
      { en: "Pay", zh: "付款" },
      { en: "Confirm", zh: "链上确认" },
      { en: "Funds", zh: "资金到账" },
    ],
    steps: [
      {
        stage: 0,
        title: { en: "Open your storefront", zh: "打开你的店铺" },
        text: { en: "This is the checkout your buyers see.", zh: "这是买家看到的结账页。" },
        page: CONSOLE,
        route: TO_CONSOLE,
        target: "nav-store",
        until: { path: "^/store" },
      },
      {
        stage: 0,
        title: { en: "Place the order", zh: "下单" },
        text: { en: "Keep United States as the country and click Pay 120.00 USDC.", zh: "国家保持「美国」，点「支付 120.00 USDC」。" },
        why: { en: "Buyers in restricted regions never see this option, and the server checks it again.", zh: "受限地区的买家看不到这个选项，服务端也会再校验一次。" },
        page: "^/store",
        route: { href: "/store", label: { en: "Open the store", zh: "打开商店" } },
        target: "store-pay",
        until: { check: "order_created" },
      },
      {
        stage: 1,
        title: { en: "Connect a wallet", zh: "连接钱包" },
        text: { en: "Use the built-in wallet if you see it, otherwise MetaMask.", zh: "有「使用内置钱包」就点它，没有就用 MetaMask。" },
        why: { en: "Every order gets its own deposit address, so a transfer matches its order without a memo or a special amount.", zh: "每笔订单都有专用收款地址，所以转账不用填备注、也不用付特殊金额就能对上订单。" },
        page: "^/pay/",
        route: { href: "/store", to: "request", label: { en: "Open the payment page", zh: "打开付款页" } },
        target: "pay-connect",
        until: { check: "wallet_connected" },
      },
      {
        stage: 2,
        title: { en: "Pay with one signature", zh: "签名一次完成付款" },
        text: { en: "Click Pay 120.00 USDC — no gas needed, and sign if your wallet asks.", zh: "点「支付 120.00 USDC（无需 Gas）」，钱包要求时签名。" },
        why: { en: "The platform submits the transaction and pays the network fee, only for the exact amount going to this order's address. A buyer with USDC but no ETH can still pay.", zh: "由平台提交交易并支付手续费，而且只代付「金额正好、地址正好」的授权。手里有 USDC 但没有 ETH 的买家也能付款。" },
        page: "^/pay/",
        route: { href: "/store", to: "request", label: { en: "Open the payment page", zh: "打开付款页" } },
        target: "pay-gasless",
        until: { check: "payment_detected" },
      },
      {
        stage: 3,
        title: { en: "Confirming on-chain", zh: "链上确认中" },
        text: { en: "Nothing to do. The page updates itself within seconds.", zh: "不用操作，页面几秒内会自动更新。" },
        why: { en: "Buyers get an answer in seconds, because all they need to know is that it worked.", zh: "买家几秒内就能得到结果，因为他们只需要知道付款成功了。" },
        page: "^/pay/",
        route: { href: "/store", to: "request", label: { en: "Open the payment page", zh: "打开付款页" } },
        target: "pay-status",
        until: { check: "payment_succeeded" },
        waiting: true,
      },
      {
        stage: 3,
        title: { en: "Paid. Now see the merchant's side", zh: "付款成功，看看商户这边" },
        text: { en: "This is what your buyer sees, with the on-chain transaction. Open the order in your dashboard to see it matched.", zh: "这是买家看到的页面，下方是链上交易。到控制台打开这笔订单，看它如何自动对上。" },
        page: "^/pay/",
        target: "pay-success",
        cta: true,
        route: { href: "/merchant/orders", to: "order", label: { en: "Open this order", zh: "打开这笔订单" } },
        until: { path: ORDER_PAGE },
      },
      {
        stage: 4,
        title: { en: "Waiting for funds to clear", zh: "等待资金到账" },
        text: { en: "Same transaction hash, and nobody matched it by hand. Funds turn Available within a few minutes. You can look around meanwhile.", zh: "交易哈希一致，全程没有人工匹配。资金会在几分钟内变成「可用」，这段时间你可以随便看看。" },
        why: { en: "Buyer and merchant wait for different things. A very recent block can still be undone, and that risk sits with the platform and merchant, so the money is held back a little longer.", zh: "买家和商户等的不是同一件事。很新的区块还可能被回滚，这个风险由平台和商户承担，所以资金会晚一点放行。" },
        page: ORDER_PAGE,
        route: { href: "/merchant/orders", to: "order", label: { en: "Open this order", zh: "打开这笔订单" } },
        target: "order-funds",
        until: { check: "funds_available" },
        waiting: true,
      },
    ],
  },
  {
    id: "when-it-goes-wrong",
    title: { en: "Handle a payment that goes wrong", zh: "处理出问题的付款" },
    summary: { en: "An underpayment and a flagged wallet: what each person sees, and who decides.", zh: "一笔少付、一笔来自风险钱包的付款：每个角色看到什么，由谁决定。" },
    minutes: 3,
    stages: [
      { en: "Underpaid", zh: "少付" },
      { en: "Top-up", zh: "补款" },
      { en: "Flagged", zh: "风险拦截" },
      { en: "Frozen", zh: "资金冻结" },
      { en: "Decision", zh: "合规决定" },
    ],
    steps: [
      {
        stage: 0,
        title: { en: "Open payment scenarios", zh: "打开付款场景" },
        text: { en: "Run real situations against a live payment request.", zh: "在一笔进行中的付款请求上运行各种真实情况。" },
        page: CONSOLE,
        route: TO_CONSOLE,
        target: "nav-scenarios",
        until: { path: "^/ops/scenarios" },
      },
      {
        stage: 0,
        title: { en: "Create an order", zh: "新建订单" },
        text: { en: "Click New order. It appears at the top of the list.", zh: "点「新建订单」，它会出现在列表最上方。" },
        page: "^/ops/scenarios",
        route: TO_SCENARIOS,
        target: "scen-new",
        until: { check: "order_created" },
      },
      {
        stage: 0,
        title: { en: "The buyer sends too little", zh: "买家少付了" },
        text: { en: "Click Underpay (−25%).", zh: "点「少付（−25%）」。" },
        why: { en: "On-chain transfers can't be reversed, so the rule for each mistake is decided in advance rather than left to a support agent.", zh: "链上转账不可撤销，所以每种错误的处理规则要事先定好，不能留给客服临时判断。" },
        page: "^/ops/scenarios",
        route: TO_SCENARIOS,
        target: "scen-underpay",
        until: { check: "underpaid_seen" },
      },
      {
        stage: 1,
        title: { en: "The buyer tops up", zh: "买家补款" },
        text: { en: "Click Top up remainder. Buyer view shows how much was still due.", zh: "点「补足差额」。「买家视角」里可以看到当时还差多少。" },
        why: { en: "Both transfers count toward the same order. If the buyer never tops up, the partial payment is refunded in full by default.", zh: "两笔转账合并计入同一个订单。如果买家一直不补，已付部分默认全额退回。" },
        page: "^/ops/scenarios",
        route: TO_SCENARIOS,
        target: "scen-topup",
        until: { check: "topped_up" },
      },
      {
        stage: 2,
        title: { en: "Another order", zh: "再建一笔订单" },
        text: { en: "Click New order again.", zh: "再点一次「新建订单」。" },
        page: "^/ops/scenarios",
        route: TO_SCENARIOS,
        target: "scen-new",
        until: { check: "second_order" },
      },
      {
        stage: 2,
        title: { en: "A flagged wallet pays", zh: "风险钱包付款" },
        text: { en: "Click Payer on risk list.", zh: "点「付款人在风险名单上」。" },
        why: { en: "Screening runs before the money reaches the merchant's balance.", zh: "筛查发生在这笔钱进入商户余额之前。" },
        page: "^/ops/scenarios",
        route: TO_SCENARIOS,
        target: "scen-risk_payer",
        until: { check: "screening_hit" },
      },
      {
        stage: 3,
        title: { en: "Open the order", zh: "打开这笔订单" },
        text: { en: "Click the order number to see what the merchant sees.", zh: "点订单号，看看商户看到的是什么。" },
        page: "^/ops/scenarios",
        route: TO_SCENARIOS,
        target: "scen-order",
        until: { path: ORDER_PAGE },
      },
      {
        stage: 3,
        title: { en: "Frozen, with no refund button", zh: "已冻结，也没有退款按钮" },
        text: { en: "Under review and Frozen. The buyer's page only says the payment is processing.", zh: "状态是「审核中」和「已冻结」。买家页面只显示「处理中」。" },
        why: { en: "Telling the buyer would warn someone who may be moving illicit funds, and a refund would send the money back to the flagged address. The cost is a confusing wait for an honest buyer caught by a false match.", zh: "告诉买家，等于提醒可能在转移非法资金的人；退款则等于把钱还给被标记的地址。代价是被误伤的正常买家只能困惑地等待。" },
        page: ORDER_PAGE,
        route: { href: "/merchant/orders", to: "order", label: { en: "Open this order", zh: "打开这笔订单" } },
        target: "order-badges",
        until: "next",
      },
      {
        stage: 4,
        title: { en: "Go to the exception queue", zh: "进入异常队列" },
        text: { en: "Every case that needs a person ends up here.", zh: "所有需要人工处理的情况都会进到这里。" },
        page: CONSOLE,
        route: TO_CONSOLE,
        target: "nav-exceptions",
        until: { path: "^/ops/exceptions" },
      },
      {
        stage: 4,
        title: { en: "Make the compliance call", zh: "做出合规决定" },
        text: { en: "Choose Keep frozen & file report, or Release (false positive).", zh: "选择「保持冻结并上报」或「放行（误报）」。" },
        why: { en: "This call belongs to compliance, not the merchant.", zh: "这个决定属于合规团队，不属于商户。" },
        page: "^/ops/exceptions",
        route: { href: "/ops/exceptions", label: { en: "Open the exception queue", zh: "打开异常队列" } },
        target: "exception-{order}",
        until: { check: "screening_handled" },
      },
    ],
  },
  {
    id: "money-out",
    title: { en: "Refund, settle and reconcile", zh: "退款、结算、对账" },
    summary: { en: "Give money back, convert the rest to SGD, and check that the books add up.", zh: "把钱退回去，把其余的换成新元，再确认账目对得上。" },
    minutes: 3,
    stages: [
      { en: "Refund", zh: "退款" },
      { en: "Preview", zh: "换汇预览" },
      { en: "Settle", zh: "结算" },
      { en: "Reconcile", zh: "对账" },
    ],
    steps: [
      {
        stage: 0,
        title: { en: "Refund the first order", zh: "退掉第一笔订单" },
        text: { en: "Click Refund in full, then confirm. Any paid order that isn't settled works.", zh: "点「全额退款」并确认。其他未结算的已付款订单也可以。" },
        why: { en: "There's nowhere to type another address, because “refund somewhere else” is a classic path for fraud and laundering. The cost: a buyer who paid from an exchange's shared wallet may not get the refund.", zh: "这里没有地方可以填别的地址，因为「退到另一个地址」是欺诈和洗钱的经典路径。代价是从交易所共用钱包付款的买家可能收不到退款。" },
        page: "^/merchant/orders",
        route: { href: "/merchant/orders", to: "first-order", label: { en: "Open the order", zh: "打开订单" } },
        target: "order-refund",
        until: { check: "refund_done" },
      },
      {
        stage: 1,
        title: { en: "Open settlement", zh: "打开结算" },
        text: { en: "Your USDC balance becomes SGD here.", zh: "你的 USDC 余额在这里换成新元。" },
        page: CONSOLE,
        route: TO_CONSOLE,
        target: "nav-settlement",
        until: { path: "^/merchant/settlement" },
      },
      {
        stage: 1,
        title: { en: "See the numbers first", zh: "先看清数字" },
        text: { en: "Rate, spread and what you'll receive are all shown before anything converts.", zh: "汇率、点差和实收金额都在换汇之前展示。" },
        why: { en: "These merchants pay rent and salaries in SGD, so daily conversion is the default.", zh: "这些商户的房租和工资都用新元，所以默认每日换汇。" },
        page: "^/merchant/settlement",
        route: { href: "/merchant/settlement", label: { en: "Open settlement", zh: "打开结算页" } },
        target: "settle-preview",
        until: "next",
      },
      {
        stage: 2,
        title: { en: "Run today's settlement", zh: "运行今日结算" },
        text: { en: "Click Run today's settlement now. If nothing is available yet, wait a few minutes for the order you topped up.", zh: "点「立即运行今日结算」。如果提示还没有可结算的资金，再等几分钟，让补过款的订单到账。" },
        why: { en: "Once an order is settled its Refund button is gone, because that money has already left as SGD.", zh: "订单结算后退款按钮就没有了，因为这笔钱已经换成新元打出去了。" },
        page: "^/merchant/settlement",
        route: { href: "/merchant/settlement", label: { en: "Open settlement", zh: "打开结算页" } },
        target: "settle-run",
        until: { check: "settlement_run" },
      },
      {
        stage: 3,
        title: { en: "Open reconciliation", zh: "打开对账" },
        text: { en: "Chain, FX and bank, side by side.", zh: "链上、换汇、银行，三列对照。" },
        page: CONSOLE,
        route: TO_CONSOLE,
        target: "nav-reconciliation",
        until: { path: "^/merchant/reconciliation" },
      },
      {
        stage: 3,
        title: { en: "Your new batch", zh: "你的新批次" },
        text: { en: "Each order is matched across all three columns.", zh: "每笔订单都在三列里对上了。" },
        page: "^/merchant/reconciliation",
        route: { href: "/merchant/reconciliation", label: { en: "Open reconciliation", zh: "打开对账页" } },
        target: "recon-first",
        until: "next",
      },
      {
        stage: 3,
        title: { en: "When the books don't match", zh: "账目对不上的时候" },
        text: { en: "A batch with a break is flagged in red, with the difference spelled out.", zh: "有差错的批次会标红，并写清差在哪里。" },
        why: { en: "The red flag means someone sees the problem the same day rather than at month-end.", zh: "标红的意义在于当天就有人看到问题，而不是拖到月底。" },
        page: "^/merchant/reconciliation",
        route: { href: "/merchant/reconciliation", label: { en: "Open reconciliation", zh: "打开对账页" } },
        target: "recon-break",
        until: "next",
      },
    ],
  },
];

export const getPart = (id: string) => PARTS.find((p) => p.id === id);
