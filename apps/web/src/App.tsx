
const roles = [
  {
    name: 'System Administrator',
    description: 'Trust registry and platform governance',
    color: 'bg-[#6D28D9]',
  },
  {
    name: 'University Administrator',
    description: 'Academic records and credential issuance',
    color: 'bg-[#1D4ED8]',
  },
  {
    name: 'Bank Administrator',
    description: 'Recruitment and credential verification',
    color: 'bg-[#0F766E]',
  },
  {
    name: 'Credential Holder',
    description: 'Digital wallet and selective disclosure',
    color: 'bg-[#15803D]',
  },
]

function App() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-16 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            SSI Academic Credential Platform
          </h1>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {roles.map((role) => (
            <div
              key={role.name}
              className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className={`mb-5 h-10 w-10 rounded-lg ${role.color}`} />

              <h2 className="text-base font-semibold text-slate-900">
                {role.name}
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                {role.description}
              </p>
            </div>
          ))}
        </div>  
      </div>
    </main>
  )
}

export default App
