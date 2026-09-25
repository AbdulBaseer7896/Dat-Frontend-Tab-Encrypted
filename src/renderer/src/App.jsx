import { useEffect, useState } from 'react'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import UserPanel from './components/UserPanel'
import Maintenance from './components/Maintenance'
import logo from './assets/logo.png'
import { Button, Skeleton, Snackbar } from '@mui/material'

function App() {
  const [loginUser, setLoginUser] = useState()
  const [isUpdate, setIsUpdate] = useState({
    available: false,
    message: 'Checking for update.'
  })
  const [openSnack, setOpenSnack] = useState(false)
  const [snackMsg, setSnackMsg] = useState('')
  const [isMaintenance, setIsMaintenance] = useState(false)

  const snackMessage = (msg) => {
    setSnackMsg(msg)
    setOpenSnack(true)
  }

  const handleSnackClose = () => {
    setOpenSnack(false)
  }

  useEffect(() => {
    // Setting up IPC event listeners and handling authentication
    if (typeof window !== 'undefined') {
      window.electron.ipcRenderer.on('check-session', (event, user) => {
        console.log('user', user)

        setLoginUser(user)
      })
      window.electron.ipcRenderer.on('update-msg', (event, msg) => {
        setIsUpdate(msg)
      })
      window.electron.ipcRenderer.on('maintenance-mode', (event, maintenanceStatus) => {
        setIsMaintenance(maintenanceStatus)
      })
    }
  }, [])

  useEffect(() => {
    // Function to fetch user data
    const fetchUserData = async () => {
      try {
        if (typeof window !== 'undefined') {
          const userData = await window.api.get('user')
          setLoginUser(userData)
          const updateMsg = await window.api.get('update-msg')
          updateMsg != null && setIsUpdate(updateMsg)
        }
      } catch (error) {
        console.error('Error fetching user data:', error)
      }
    }

    // Fetch user data immediately
    fetchUserData()

    // Set up interval to fetch user data every 10 seconds
    const intervalId = setInterval(fetchUserData, 10000)

    // Cleanup function to clear the interval
    return () => {
      clearInterval(intervalId)
    }
  }, [])

  const logout = async () => {
    await window.api.set('user', null)
    setLoginUser(null)
  }
  const checkLogin = async () => {
    const userData = await window.api.get('user')
    setLoginUser(userData)
  }
  return (
    <div className="min-h-screen flex text-black">
      <img alt="logo" className="logo" src={logo} />
      {isUpdate.available ? (
        <div className="flex justify-center items-center">
          <div className="bg-white shadow-2xl rounded-lg p-10 pb-4 w-[370px]">
            <div className="">
              <h2 className="text-4xl text-center text-black mb-1">Update</h2>
              <p className="text-center text-gray-500">New Version Available</p>
            </div>
            <hr className="mt-4 mb-6 bg-gray-500" />
            <div className="text-center px-10 text-bold pt-6">
              <div className="mb-24 text-center user-download">
                <Skeleton animation="wave" />
                <div className="mt-4 text-lg text-gray-600 animate-pulse">
                  {isUpdate.message && isUpdate.message}
                </div>
              </div>
            </div>
            <div className="mb-6 px-10">
              <Button
                fullWidth
                variant="outlined"
                sx={{
                  backgroundColor: 'black',
                  color: '#fff',
                  '&:hover': {
                    backgroundColor: 'black',
                    color: '#fff'
                  },
                  '&:active': {
                    backgroundColor: 'black',
                    color: '#fff'
                  },
                  '&.Mui-disabled': {
                    backgroundColor: 'black',
                    color: '#fff'
                  }
                }}
                onClick={async () => await window.electron.ipcRenderer.invoke('close-main-app')}
              >
                Exit
              </Button>
            </div>
            <small className="text-[12px]">
              By continuing you agree to our terms and conditions.
            </small>
          </div>
        </div>
      ) : isMaintenance ? (
        <Maintenance /> // Render the Maintenance component
      ) : loginUser === null || loginUser === undefined ? (
        <Login checkLogin={checkLogin} />
      ) : (
        <>
          {loginUser.role === 'admin' ? (
            <Dashboard logout={logout} loginUser={loginUser} snackMessage={snackMessage} />
          ) : (
            <UserPanel logout={logout} loginUser={loginUser} snackMessage={snackMessage} />
          )}
        </>
      )}
      <Snackbar
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        open={openSnack}
        onClose={handleSnackClose}
        message={snackMsg}
        action={
          <Button color="inherit" onClick={handleSnackClose}>
            X
          </Button>
        }
      />
    </div>
  )
}

export default App
