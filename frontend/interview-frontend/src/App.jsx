import { useState } from 'react'
import LandingPage from './pages/LandingPage'
import StartInterview from './pages/StartInterview'
import Interview from './pages/Interview'
import Instructions from './pages/Instructions'
import EvaluationReport from './pages/EvaluationReport'
import './App.css'

function App() {
  const [page, setPage] = useState('home')

  if (page === 'start') {
  return <StartInterview onProceed={() => setPage('instructions')} />
}
  if (page === 'instructions') {
  return <Instructions onContinue={() => setPage('interview')} />
}
if (page === 'interview') {
  return <Interview />
}
if (page === 'evaluation') {
  return <EvaluationReport />
}

  return (
    <LandingPage
      onStartInterview={() => setPage('start')}
    />
  )
}

export default App