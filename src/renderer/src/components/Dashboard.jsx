import * as React from 'react'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Box from '@mui/material/Box'
import UserList from './UserList'
import DatAccountList from './DatAccountList'
import Domain from './Domain'

function CustomTabPanel(props) {
  // eslint-disable-next-line react/prop-types
  const { children, value, index, ...other } = props

  return (
    <div
      className="overflow-hidden"
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  )
}

function a11yProps(index) {
  return {
    id: `simple-tab-${index}`,
    'aria-controls': `simple-tabpanel-${index}`
  }
}

// eslint-disable-next-line react/prop-types
export default function Dashboard({ loginUser, logout, snackMessage }) {
  const [value, setValue] = React.useState(0)

  const handleChange = (event, newValue) => {
    setValue(newValue)
  }

  return (
    <div className="flex justify-center items-center w-screen h-screen">
      <div className="bg-white shadow-2xl rounded-lg w-[90%] h-[80%] overflow-auto">
        <Box sx={{ width: '100%' }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={value} onChange={handleChange} aria-label="basic tabs example">
              <Tab label="Users" {...a11yProps(0)} />
              <Tab label="DAT Account" {...a11yProps(1)} />
              <Tab label="Allowed Domains" {...a11yProps(2)} />
              <Tab label="Logout" onClick={() => logout()} sx={{ marginLeft: 'auto' }} />
            </Tabs>
          </Box>
          <CustomTabPanel value={value} index={0}>
            <UserList loginUser={loginUser} snackMessage={snackMessage} />
          </CustomTabPanel>
          <CustomTabPanel value={value} index={1}>
            <DatAccountList snackMessage={snackMessage} />
          </CustomTabPanel>
          <CustomTabPanel value={value} index={2}>
            <Domain snackMessage={snackMessage} />
          </CustomTabPanel>
        </Box>
      </div>
    </div>
  )
}
