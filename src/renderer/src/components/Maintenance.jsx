import repair from '../assets/repair.png'
import { Button } from '@mui/material'

export default function Maintenance() {
  return (
    <div className="flex justify-center items-center">
      <div className="bg-white shadow-2xl rounded-lg p-10 pb-4 w-[450px] text-center">
        <img alt="logo" className="" src={repair} />
        <h1 className="text-2xl font-bold tracking-tight">Site is temporarily unavailable.</h1>
        <p className="mt-6 text-lg leading-8 text-gray">
          Scheduled maintenance is currently in progress. Please check back soon.
        </p>
        <p className="mb-5 text-lg leading-8 text-gray">We apologize for any inconvenience.</p>
        <Button
          variant="outlined"
          sx={{
            backgroundColor: 'black',
            padding: '10px 40px',
            color: '#fff'
          }}
          onClick={async () => await window.electron.ipcRenderer.invoke('close-main-app')}
        >
          Exit
        </Button>
      </div>
    </div>
  )
}
