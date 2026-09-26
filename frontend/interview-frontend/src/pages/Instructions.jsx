function Instructions({ onContinue }) {
  return (
    <div className="landing-page instruc">
      <h1>INTERVIEW INSTRUCTIONS</h1>

      <div className="instructions-box">
        <p>Before you begin, please make sure:</p>

        <ul>
          <li>
            <strong>Camera:</strong> Keep your camera at eye level and make
            sure your face is clearly visible.
          </li>

          <li>
            <strong>Lighting:</strong> Sit in a well-lit area with your face
            evenly illuminated.
          </li>

          <li>
            <strong>Background:</strong> Use a plain and uncluttered
            background.
          </li>

          <li>
            <strong>Clothing:</strong> Wear neat, formal/professional
            clothing.
          </li>

          <li>
            <strong>Environment:</strong> Choose a quiet place with minimal
            distractions.
          </li>

          <li>
            <strong>Position:</strong> Stay comfortably centered and visible
            in the camera frame.
          </li>
        </ul>
      </div>

      <button className="proceed-button" onClick={onContinue}>
        I Understand & Continue
      </button>
    </div>
  )
}

export default Instructions