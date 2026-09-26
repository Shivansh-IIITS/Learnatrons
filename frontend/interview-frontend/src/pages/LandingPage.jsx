function LandingPage({ onStartInterview }) {
  return (
    <div className="landing-page">
      <h1>AI INTERVIEW</h1>

      <p>Prepare. Practice. Perform.</p>

      <div className="options">
        <button
          className="option-card"
          onClick={onStartInterview}
        >
          START INTERVIEW
        </button>

        <button className="option-card"
        onClick={onStartInterview}>
          PRACTICE INTERVIEW
        </button>
      </div>
    </div>
  )
}

export default LandingPage