function StartInterview({ onProceed}) {
  return (
    <div className="landing-page">
           <h1>START INTERVIEW</h1>

      <div className="setup-box">
        <div className="setup-option">
          <p> Upload Resume</p>

          <label className="file-button">
            Choose File
            <input type="file" accept=".pdf,.doc,.docx" />
          </label>
        </div>

        <div className="setup-option">
          <p> Enter Target Job</p>

          <input
            className="job-input"
            type="text"
            placeholder="Enter target job"
          />
        </div>
      </div>

      <button className="proceed-button" onClick={onProceed}>
        Proceed
      </button>
    </div>
  )
}

export default StartInterview