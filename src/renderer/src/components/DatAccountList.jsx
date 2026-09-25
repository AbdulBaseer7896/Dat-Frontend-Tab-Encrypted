import _ from 'lodash'
import * as React from 'react'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import Button from '@mui/material/Button'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TablePagination from '@mui/material/TablePagination'
import TableRow from '@mui/material/TableRow'
import { format } from 'date-fns'
import CreateUpdateDatSession from './dialog/CreateUpdateDatSession'
import { ButtonGroup, Skeleton } from '@mui/material'

const createName = (inputString) => {
  const deburredString = _.deburr(inputString)
  return _.kebabCase(deburredString)
}

const columns = [
  { id: 'name', label: 'Name', minWidth: 150 },
  { id: 'proxy', label: 'Proxy', minWidth: 200 },
  { id: 'userCounts', label: 'Users ', minWidth: 100 },
  {
    id: 'createdAt',
    label: 'Created At',
    minWidth: 200,
    format: (value) => format(new Date(value), 'MMMM d, yyyy h:mm:ss a')
  }
]

// eslint-disable-next-line react/prop-types
export default function DatAccountList({ snackMessage }) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [datSessions, setDatSessions] = React.useState([])
  const [selectedDatSession, setSelectedDatSession] = React.useState()
  const [page, setPage] = React.useState(0)
  const [rowsPerPage, setRowsPerPage] = React.useState(10)
  const [datUploadSessions, setDatUploadSessions] = React.useState([])
  const [datClearSessions, setDatClearSessions] = React.useState([])

  const handleChangePage = (event, newPage) => {
    setPage(newPage)
  }

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(+event.target.value)
    setPage(0)
  }

  // Function to toggle button disable state based on index
  const togglesDatUploadSessions = (index) => {
    setDatUploadSessions((prev) => {
      // Toggle the index in the array
      console.log(prev, index)
      if (prev.includes(index)) {
        return prev.filter((i) => i !== index)
      } else {
        return [...prev, index]
      }
    })
  }

  // Function to toggle button disable state based on index
  const togglesDatClearSessions = (index) => {
    setDatClearSessions((prev) => {
      // Toggle the index in the array
      console.log(prev, index)

      if (prev.includes(index)) {
        return prev.filter((i) => i !== index)
      } else {
        return [...prev, index]
      }
    })
  }

  // Function to fetch datSession data
  const fetchDatSessionData = async () => {
    try {
      setLoading(true)
      if (typeof window !== 'undefined') {
        const datSessionData = await window.electron.ipcRenderer.invoke('getAllDatAccounts')
        datSessionData && setDatSessions(datSessionData)
      }
    } catch (error) {
      console.error('Error fetching Dat Session data:', error)
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    fetchDatSessionData()

    return () => {
      // Clean up logic here if you set up any listeners
    }
  }, [])

  return (
    <>
      <CreateUpdateDatSession
        open={open}
        setOpen={setOpen}
        snackMessage={snackMessage}
        selectedDatSession={selectedDatSession}
        fetchDatSessionData={fetchDatSessionData}
        setSelectedDatSession={setSelectedDatSession}
      />
      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <TableContainer>
          <Table stickyHeader aria-label="sticky table">
            <TableHead>
              <TableRow>
                {columns.map((column) => (
                  <TableCell
                    key={column.id}
                    align={column.align}
                    style={{ minWidth: column.minWidth }}
                  >
                    {column.label}
                  </TableCell>
                ))}
                <TableCell style={{ minWidth: 100 }}>Create/Load Dat Account</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                [...Array(5)].map((_, index) => (
                  <TableRow key={index}>
                    <TableCell><Skeleton animation="wave" height={24} width="70%" /></TableCell>
                    <TableCell><Skeleton animation="wave" height={24} width="85%" /></TableCell>
                    <TableCell><Skeleton animation="wave" height={24} width="40%" /></TableCell>
                    <TableCell><Skeleton animation="wave" height={24} width="80%" /></TableCell>
                    <TableCell><Skeleton animation="wave" height={32} width={140} /></TableCell>
                  </TableRow>
                ))
              ) : datSessions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No DAT accounts found
                  </TableCell>
                </TableRow>
              ) : (
                datSessions
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((row, index) => {
                  return (
                    <TableRow
                      hover
                      role="checkbox"
                      tabIndex={-1}
                      key={row._id}
                      onClick={() => {
                        setSelectedDatSession(row)
                        setOpen(true)
                      }}
                    >
                      {columns.map((column) => {
                        const value = row[column.id]
                        return (
                          <TableCell key={column.id} align={column.align}>
                            {column.format ? column.format(value) : value}
                          </TableCell>
                        )
                      })}
                      <TableCell align="center">
                        <ButtonGroup
                          variant="contained"
                          color="primary"
                          aria-label="contained primary button group"
                        >
                          <Button
                            onClick={async (event) => {
                              event.stopPropagation()
                              window.electron.ipcRenderer.invoke('open-dat-session', {
                                proxy: row.proxy,
                                name: createName(row.name),
                                datSessionId: row._id
                              })
                            }}
                            sx={{ backgroundColor: row.isLoggedIn ? 'green' : 'red' }}
                          >
                            Create/Load
                          </Button>
                          <Button
                            onClick={async (event) => {
                              event.stopPropagation()
                              togglesDatUploadSessions(index)
                              const result = await window.electron.ipcRenderer.invoke(
                                'save-dat-session',
                                {
                                  name: createName(row.name),
                                  datSessionId: row._id
                                }
                              )
                              console.log(result)

                              if (result.status == 'success') {
                                snackMessage(result.message)
                              } else {
                                snackMessage(result.message + ' . Please restart the application.')
                              }
                              togglesDatUploadSessions(index)
                            }}
                            disabled={datUploadSessions.includes(index)}
                          >
                            Upload
                          </Button>
                          <Button
                            onClick={async (event) => {
                              event.stopPropagation()
                              togglesDatClearSessions(index)
                              const result = await window.electron.ipcRenderer.invoke(
                                'clear-dat-session',
                                {
                                  name: createName(row.name),
                                  datSessionId: row._id
                                }
                              )
                              if (result.status == 'success') {
                                snackMessage(result.message)
                              } else {
                                snackMessage(result.message + ' . Please restart the application.')
                              }
                              togglesDatClearSessions(index)
                            }}
                            disabled={datClearSessions.includes(index)}
                          >
                            Clear
                          </Button>
                        </ButtonGroup>
                      </TableCell>
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
          count={datSessions.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </Paper>
    </>
  )
}
