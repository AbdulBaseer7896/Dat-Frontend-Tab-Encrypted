import _ from 'lodash'
import repair from '../assets/repair.png'
import logo from '../assets/tech-logo.png'
import { useEffect, useState } from 'react'
import MenuIcon from '@mui/icons-material/Menu'
import SearchIcon from '@mui/icons-material/Search'
import LogoutIcon from '@mui/icons-material/Logout'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import { IconButton, Skeleton, Button, Paper, InputBase, Divider } from '@mui/material'

const createName = (inputString) => {
  const deburredString = _.deburr(inputString)
  return _.kebabCase(deburredString)
}

// eslint-disable-next-line react/prop-types
export default function UserPanel({ loginUser, logout }) {
  const [datFileName, setDatFileName] = useState(true)
  const [downloading, setDownloading] = useState(0)
  const [websiteURL, setWebsiteURL] = useState()
  const [websiteURLError, setWebsiteURLError] = useState()
  const [loading, setLoading] = useState(false)

  const fetchUserData = async () => {
    setLoading(true)
    try {
      if (
        typeof window !== 'undefined' &&
        loginUser.datAccount?.fileName &&
        loginUser.permission?.domain
      ) {
        setDatFileName(true)
        setDownloading(100)
      } else {
        setDatFileName(false)
      }
    } catch (error) {
      console.error('Error fetching user data:', error)
    }
    setLoading(false)
  }

  useEffect(() => {
    // Fetch user data immediately
    fetchUserData()
  }, [])

  const openUserPanel = async (loginUser, selectedDomain) => {
    setLoading(true)
    await window.electron.ipcRenderer.invoke('open-dat-user-session', {
      proxy: loginUser.datAccount.proxy,
      name: createName(loginUser.datAccount.name),
      permissions: loginUser.permission,
      fileName: loginUser.datAccount.fileName,
      datSessionId: loginUser.datAccount._id,
      domain: selectedDomain
    })
  }

  function getMainDomain(url, skipTLD = false) {
    try {
      const hostname = new URL(url).hostname
      const parts = hostname.split('.')
      const len = parts.length
      if (skipTLD && len > 1) {
        return parts[len - 2]
      }
      if (len > 2) {
        return `${parts[len - 2]}.${parts[len - 1]}`
      }
      return hostname
    } catch (error) {
      return 'Invalid URL'
    }
  }

  const handleSubmit = async () => {
    setLoading(true)
    console.log(getMainDomain(websiteURL))
    console.log(loginUser.allowedDomains)
    console.log(
      !loginUser.allowedDomains.some(
        (allowedDomain) => allowedDomain.domain === getMainDomain(websiteURL)
      )
    )

    const regex = /^(https?:\/\/)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(:[0-9]{1,5})?(\/.*)?$/
    if (!regex.test(websiteURL)) {
      setWebsiteURLError('Invalid URL, Please insert a correct URL.')
    } else if (
      !loginUser.allowedDomains.some(
        (allowedDomain) => allowedDomain.domain === getMainDomain(websiteURL)
      )
    ) {
      setWebsiteURLError("Website isn't allowed.")
    } else {
      await window.electron.ipcRenderer.invoke('open-dat-user-session', {
        proxy: loginUser.datAccount.proxy,
        name: createName(getMainDomain(websiteURL, true)),
        permissions: loginUser.permission,
        fileName: loginUser.datAccount.fileName,
        datSessionId: null,
        domain: websiteURL
      })
    }
  }

  return (
    <div className="flex justify-center items-center">
      <div className="bg-white shadow-2xl rounded-lg p-10 pb-4 w-[370px]">
        <div className="">
          <h2 className="text-4xl text-center text-black mb-1">Welcome</h2>
          <p className="text-center text-gray-500">to your DAT account.</p>
        </div>
        <hr className="mt-4 mb-6 bg-gray-500" />
        <div className="text-center text-bold pt-6">
          {!datFileName && loginUser.permission.domain ? (
            <>
              <img alt="logo" className="" src={repair} />
              <h1 className="text-2xl font-bold tracking-tight">
                Site is temporarily unavailable.
              </h1>
              <p className="mt-6 text-lg leading-8 text-gray">
                Scheduled maintenance is currently in progress. Please check back soon.
              </p>
              <p className="mb-5 text-lg leading-8 text-gray">
                We apologize for any inconvenience.
              </p>
            </>
          ) : downloading == 0 || downloading == 100 ? (
            <div className="mb-24 text-center user-download">
              {loading ? (
                <>
                  <Skeleton animation="wave" />
                  <div className="mt-4 text-lg text-gray-600 animate-pulse">Loading...</div>
                </>
              ) : (
                <>
                  {loginUser?.permission?.domain == 'https://one.dat.com/search-loads-ow' && (
                    <Button
                      variant="contained"
                      onClick={(e) =>
                        openUserPanel(loginUser, 'https://one.dat.com/search-loads-ow')
                      }
                    >
                      Go to DAT One
                    </Button>
                  )}
                  {loginUser?.permission?.domain == 'https://power.dat.com/search/loads' && (
                    <Button
                      variant="contained"
                      onClick={(e) =>
                        openUserPanel(loginUser, 'https://power.dat.com/search/loads')
                      }
                    >
                      Go to DAT Power
                    </Button>
                  )}
                  {loginUser.allowedDomains.length > 0 && (
                    <>
                      <p className="text-center my-6">OR</p>
                      <Paper
                        component="form"
                        sx={{ p: '2px 4px', display: 'flex', alignItems: 'center', width: '100%' }}
                      >
                        <InputBase
                          sx={{ ml: 1, flex: 1 }}
                          placeholder="Enter Website URL..."
                          inputProps={{ 'aria-label': 'Enter Website URL...' }}
                          onChange={(e) => {
                            setWebsiteURL(e.target.value)
                            setWebsiteURLError('')
                          }}
                        />
                        <Divider sx={{ height: 28, m: 0.5 }} orientation="vertical" />
                        <IconButton
                          color="primary"
                          sx={{ p: '10px' }}
                          aria-label="directions"
                          onClick={(e) => handleSubmit()}
                        >
                          <ArrowForwardIcon />
                        </IconButton>
                      </Paper>
                      <small className="text-red">{websiteURLError}</small>
                    </>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="mb-24 text-center user-download">
              <Skeleton animation="wave" />
              <div className="mt-4 text-lg text-gray-600 animate-pulse">
                Downloading [{downloading}%]
              </div>
            </div>
          )}
        </div>
        <div className="mb-6">
          <div className="relative w-full bottom-0 rounded-xl">
            <div className="flex justify-between overflow-visible relative max-w-sm mx-auto shadow-lg ring-1 ring-black/5 rounded-xl flex items-center gap-6 bg-slate-800 highlight-white/5">
              <div className="flex flex-col py-5 pl-8">
                <strong className="text-sm font-medium text-slate-200">{loginUser.name}</strong>
                <span className="text-sm font-medium text-slate-400">{loginUser.email}</span>
              </div>
              <IconButton
                aria-label="close"
                onClick={logout}
                className="ml-auto w-12 h-12 rounded-full shadow-lg"
              >
                <LogoutIcon className="text-white" />
              </IconButton>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center mb-2">
          <strong className="text-center text-[12px]">Powered By</strong>
          <img alt="logo" className="w-[200px]" src={logo} />
        </div>
        <small className="text-[12px]">By continuing you agree to our terms and conditions.</small>
      </div>
    </div>
  )
}
