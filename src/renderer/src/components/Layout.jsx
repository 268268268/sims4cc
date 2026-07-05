import Sidebar from './Sidebar'

export default function Layout({ activePage, onNavigate, children }) {
  return (
    <div className="flex h-screen app-bg text-white overflow-hidden">
      <Sidebar activePage={activePage} onNavigate={onNavigate} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
