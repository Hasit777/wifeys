import { useEffect, useState } from 'react'

export default function SakuraBackground() {
  const [petals, setPetals] = useState([])
  const [cats, setCats] = useState([])

  useEffect(() => {
    // generate petals
    const newPetals = Array.from({ length: 25 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      duration: 5 + Math.random() * 5,
      delay: Math.random() * 5,
    }))

    // generate cats
    const newCats = Array.from({ length: 8 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      duration: 10 + Math.random() * 10,
      delay: Math.random() * 10,
    }))

    setPetals(newPetals)
    setCats(newCats)
  }, [])

  return (
    <div className="sakura-container">
      {/* 🌸 petals */}
      {petals.map(p => (
        <div
          key={p.id}
          className="petal"
          style={{
            left: `${p.left}%`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}

      {/* 🐱 cats */}
      {cats.map(c => (
        <div
          key={c.id}
          className="cat"
          style={{
            left: `${c.left}%`,
            animationDuration: `${c.duration}s`,
            animationDelay: `${c.delay}s`,
          }}
        >
          🐱
        </div>
      ))}
    </div>
  )
}