import { AppShell } from './components/layout/AppShell'
import { WorkspaceOutlet } from './workspaces/WorkspaceOutlet'
import { MotionWorkspace } from './workspaces/motion/MotionWorkspace'

function App() {
  return (
    <AppShell>
      <WorkspaceOutlet workspaceId="motion">
        <MotionWorkspace />
      </WorkspaceOutlet>
    </AppShell>
  )
}

export default App
