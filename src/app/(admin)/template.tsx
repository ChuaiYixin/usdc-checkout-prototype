// Page transition inside the console. Next remounts a template on navigation; the sidebar in the layout stays put.
export default function ConsoleTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page">{children}</div>;
}
