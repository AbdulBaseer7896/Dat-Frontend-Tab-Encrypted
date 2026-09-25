import * as React from 'react'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableSortLabel from '@mui/material/TableSortLabel'
import TablePagination from '@mui/material/TablePagination'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import { format, isBefore, parseISO, subMinutes } from 'date-fns'
import CreateUpdateUser from './dialog/CreateUpdateUser'
import { Chip, Tooltip, Skeleton } from '@mui/material'
import { blue, green, purple, red } from '@mui/material/colors'

const capitalizeFirstChar = (str) => {
  if (!str) return str // Check for empty string
  return str.charAt(0).toUpperCase() + str.slice(1)
}

// Component for checking if the last updated time is within the last minute
const isRecentlyUpdated = (lastUpdated) => {
  if (lastUpdated) {
    const lastUpdateDate = parseISO(lastUpdated)
    const now = new Date()
    const oneMinuteAgo = subMinutes(now, 1)

    // Determine the online status and color
    const isOnline = isBefore(oneMinuteAgo, lastUpdateDate)
    const statusColor = isOnline ? green[500] : red[500]
    const statusText = isOnline ? 'Online' : 'Offline'

    // Formatting the last online time
    const formattedLastOnline = new Date(lastUpdated).toLocaleString()
    const tooltipText = `Last Online: ${formattedLastOnline}`
    if (isOnline == 'Online') {
      return (
        <Chip
          label={statusText}
          sx={{
            backgroundColor: statusColor,
            color: 'white',
            '&:hover': {
              backgroundColor: isOnline ? green[600] : red[600]
            }
          }}
        />
      )
    } else {
      return (
        <Tooltip title={tooltipText} arrow>
          <Chip
            label={statusText}
            sx={{
              backgroundColor: statusColor,
              color: 'white',
              '&:hover': {
                backgroundColor: isOnline ? green[600] : red[600]
              }
            }}
          />
        </Tooltip>
      )
    }
  } else {
    return (
      <Chip
        label={'Offline'}
        sx={{
          backgroundColor: red[600],
          color: 'white',
          '&:hover': {
            backgroundColor: red[600]
          }
        }}
      />
    )
  }
}

// eslint-disable-next-line no-unused-vars
const datAccountType = (domain) => {
  if (domain == 'https://one.dat.com/search-loads-ow') {
    return (
      <Chip
        label={'DAT ONE'}
        sx={{
          backgroundColor: purple[600],
          color: 'white',
          '&:hover': {
            backgroundColor: purple[600]
          }
        }}
      />
    )
  }
  if (domain == 'https://power.dat.com/search/loads') {
    return (
      <Chip
        label={'DAT POWER'}
        sx={{
          backgroundColor: blue[600],
          color: 'white',
          '&:hover': {
            backgroundColor: blue[600]
          }
        }}
      />
    )
  }
  return (
    <Chip
      label={'None'}
      sx={{
        backgroundColor: red[600],
        color: 'white',
        '&:hover': {
          cursor: 'pointer',
          backgroundColor: red[600]
        }
      }}
    />
  )
}

export default function UserList({ loginUser, snackMessage }) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [users, setUsers] = React.useState([])
  const [datSessions, setDatSessions] = React.useState([])
  const [domains, setDomains] = React.useState([])
  const [selectedUser, setSelectedUser] = React.useState()
  const [page, setPage] = React.useState(0)
  const [rowsPerPage, setRowsPerPage] = React.useState(10)
  const [searchTerm, setSearchTerm] = React.useState('')
  const [order, setOrder] = React.useState('asc')
  const [orderBy, setOrderBy] = React.useState()

  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === 'asc'
    setOrder(isAsc ? 'desc' : 'asc')
    setOrderBy(property)
  }

  const handleChangePage = (event, newPage) => {
    setPage(newPage)
  }

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(+event.target.value)
    setPage(0)
  }

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value)
  }

  // Function to fetch user data
  const fetchUserData = async () => {
    try {
      setLoading(true)
      if (typeof window !== 'undefined') {
        const userData = await window.electron.ipcRenderer.invoke('getAllUsers')
        setUsers(userData || [])
      }
    } catch (error) {
      console.error('Error fetching user data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Function to fetch datSession data
  const fetchDatSessionData = async () => {
    try {
      if (typeof window !== 'undefined') {
        const datSessionData = await window.electron.ipcRenderer.invoke('getAllDatAccounts')
        setDatSessions(datSessionData || [])
      }
    } catch (error) {
      console.error('Error fetching Dat Session data:', error)
    }
  }

  // Function to fetch domain data
  const fetchDomainData = async () => {
    try {
      if (typeof window !== 'undefined') {
        const domainData = await window.electron.ipcRenderer.invoke('getAllDomains')
        setDomains(domainData || [])
      }
    } catch (error) {
      console.error('Error fetching Dat Session data:', error)
    }
  }

  React.useEffect(() => {
    fetchUserData()
    fetchDatSessionData()
    fetchDomainData()

    return () => {
      // Clean up logic here if you set up any listeners
    }
  }, [])

  // Filter users based on the search term
  const filteredUsers = users.filter((user) =>
    Object.values(user).some(
      (value) =>
        value !== null &&
        value !== undefined &&
        value.toString().toLowerCase().includes(searchTerm.toLowerCase())
    )
  )

  const sortedUsers = filteredUsers.sort((a, b) => {
    let valueA = (a[orderBy] || '').trim() // Trim spaces
    let valueB = (b[orderBy] || '').trim() // Trim spaces

    // Check if it's the 'isOnline' column
    if (orderBy === 'isOnline' || orderBy === 'createdAt') {
      const dateA = new Date(valueA)
      const dateB = new Date(valueB)
      return order === 'asc' ? dateA - dateB : dateB - dateA
    }
    // Check for nested dataSessionId.name sorting
    else if (orderBy === 'account') {
      const nameA = a.permissions?.dataSessionId?.name?.trim().toLowerCase() || ''
      const nameB = b.permissions?.dataSessionId?.name?.trim().toLowerCase() || ''

      return order === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA)
    }
    // Boolean sorting for 'role' or 'ban'
    else if (typeof valueA === 'boolean' && typeof valueB === 'boolean') {
      return order === 'asc'
        ? valueA === valueB
          ? 0
          : valueA
            ? 1
            : -1
        : valueA === valueB
          ? 0
          : valueA
            ? -1
            : 1
    }

    // Case-insensitive string sorting with trimmed values
    else if (typeof valueA === 'string' && typeof valueB === 'string') {
      return order === 'asc'
        ? valueA.toLowerCase().localeCompare(valueB.toLowerCase()) // Ascending order
        : valueB.toLowerCase().localeCompare(valueA.toLowerCase()) // Descending order
    }

    // Numerical or other comparisons
    else {
      return order === 'asc' ? valueA - valueB : valueB - valueA
    }
  })

  return (
    <>
      <Paper sx={{ width: '100%', overflow: 'hidden', padding: 2 }}>
        <div className="w-full flex mb-2 justify-between">
          <TextField
            label="Search"
            variant="outlined"
            fullWidth
            size="small"
            value={searchTerm}
            onChange={handleSearchChange}
            sx={{ marginBottom: 2, width: '200px' }}
          />
          <CreateUpdateUser
            open={open}
            setOpen={setOpen}
            datSessions={datSessions}
            domains={domains}
            selectedUser={selectedUser}
            fetchUserData={fetchUserData}
            setSelectedUser={setSelectedUser}
            snackMessage={snackMessage}
          />
        </div>
        <TableContainer>
          <Table stickyHeader aria-label="sticky table">
            <TableHead>
              <TableRow>
                <TableCell style={{ minWidth: 200 }}>
                  <TableSortLabel
                    active={orderBy === 'Name'.toLowerCase()}
                    direction={orderBy === 'Name'.toLowerCase() ? order : 'asc'}
                    onClick={() => handleRequestSort('Name'.toLowerCase())}
                  >
                    Name{' '}
                  </TableSortLabel>
                </TableCell>
                <TableCell style={{ minWidth: 200 }}>
                  <TableSortLabel
                    active={orderBy === 'Email'.toLowerCase()}
                    direction={orderBy === 'Email'.toLowerCase() ? order : 'asc'}
                    onClick={() => handleRequestSort('Email'.toLowerCase())}
                  >
                    Email Address{' '}
                  </TableSortLabel>
                </TableCell>
                <TableCell style={{ minWidth: 150 }}>
                  <TableSortLabel
                    active={orderBy === 'account'}
                    direction={orderBy === 'account' ? order : 'asc'}
                    onClick={() => handleRequestSort('account')}
                  >
                    Account Name{' '}
                  </TableSortLabel>
                </TableCell>
                <TableCell style={{ minWidth: 120 }}>
                  <TableSortLabel
                    active={orderBy === 'isOnline'}
                    direction={orderBy === 'isOnline' ? order : 'asc'}
                    onClick={() => handleRequestSort('isOnline')}
                  >
                    Status{' '}
                  </TableSortLabel>
                </TableCell>
                <TableCell style={{ minWidth: 120 }}>
                  Device Binding
                </TableCell>
                <TableCell style={{ minWidth: 100 }}>
                  <TableSortLabel
                    active={orderBy === 'Role'.toLowerCase()}
                    direction={orderBy === 'Role'.toLowerCase() ? order : 'asc'}
                    onClick={() => handleRequestSort('Role'.toLowerCase())}
                  >
                    Role{' '}
                  </TableSortLabel>
                </TableCell>
                <TableCell style={{ minWidth: 100 }}>
                  <TableSortLabel
                    active={orderBy === 'isBanned'}
                    direction={orderBy === 'isBanned' ? order : 'asc'}
                    onClick={() => handleRequestSort('isBanned')}
                  >
                    Ban{' '}
                  </TableSortLabel>
                </TableCell>

                <TableCell style={{ minWidth: 220 }}>
                  <TableSortLabel
                    active={orderBy === 'createdAt'}
                    direction={orderBy === 'createdAt' ? order : 'asc'}
                    onClick={() => handleRequestSort('createdAt')}
                  >
                    Created At{' '}
                  </TableSortLabel>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                [...Array(6)].map((_, index) => (
                  <TableRow key={index}>
                    <TableCell><Skeleton animation="wave" height={24} width="80%" /></TableCell>
                    <TableCell><Skeleton animation="wave" height={24} width="90%" /></TableCell>
                    <TableCell><Skeleton animation="wave" height={24} width="70%" /></TableCell>
                    <TableCell><Skeleton animation="wave" height={24} width="60%" /></TableCell>
                    <TableCell><Skeleton animation="wave" height={24} width="75%" /></TableCell>
                    <TableCell><Skeleton animation="wave" height={24} width="50%" /></TableCell>
                    <TableCell><Skeleton animation="wave" height={24} width="40%" /></TableCell>
                    <TableCell><Skeleton animation="wave" height={24} width="85%" /></TableCell>
                  </TableRow>
                ))
              ) : sortedUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                sortedUsers
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((row) => {
                  return (
                    <TableRow
                       hover
                       role="checkbox"
                       tabIndex={-1}
                       key={row._id}
                       onClick={() => {
                         setSelectedUser({ ...row, password: '' })
                         setOpen(true)
                       }}
                     >
                       <TableCell>{row.name}</TableCell>
                       <TableCell>{row.email}</TableCell>
                       <TableCell>
                         {row.permissions && row.permissions.dataSessionId
                           ? row.permissions.dataSessionId.name
                           : 'Not Set'}
                       </TableCell>
                       <TableCell>{isRecentlyUpdated(row.isOnline)}</TableCell>
                       <TableCell>
                         {row.hardwareId ? (
                           <Tooltip title={`Hardware ID: ${row.hardwareId}`} arrow>
                             <Chip
                               label="Bound"
                               size="small"
                               sx={{
                                 backgroundColor: blue[600],
                                 color: 'white',
                                 fontWeight: 500
                               }}
                             />
                           </Tooltip>
                         ) : (
                           <Chip
                             label="Unbound"
                             size="small"
                             variant="outlined"
                             sx={{ color: 'text.secondary' }}
                           />
                         )}
                       </TableCell>
                       <TableCell>{capitalizeFirstChar(row.role)}</TableCell>
                       <TableCell>{row.isBanned ? 'Yes' : 'No'}</TableCell>
                       <TableCell>{format(row.createdAt, 'MMMM d, yyyy h:mm:ss a')}</TableCell>
                     </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[10, 25, 100]}
          component="div"
          count={filteredUsers.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </Paper>
    </>
  )
}
