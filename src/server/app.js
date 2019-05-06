const express = require('express')
const app = express()
const http = require('http')
const socketIo = require('socket.io')
const { Datastore } = require('@google-cloud/datastore')
const { Tower } = require('./tower')

const server = http.createServer(app)
const io = socketIo(server)

const store = new Datastore()

let tower

const generateDefaultTower = () => {
  tower = new Tower({ maxHeight: 10 })
  saveToDataStore()
}

const loadFromDatastore = () => {
  return store.runQuery(store.createQuery('tower'))
    .then(response => {
      const data = response && response[0] && response[0][0]
      if (data) {
        tower = new Tower(data)
      } else {
        generateDefaultTower()
      }
   }).catch(() => {
      generateDefaultTower()
   })
}

const saveToDataStore = () => {
  store.save({
    key: store.key(['tower','tower']),
    data: {
      timestamp: new Date(),
      ...tower.export()
    }
  })
}

const debounce = (fn, delay) => {
  let timeout
  return (...args) => {
    clearTimeout(timeout)
    timeout = setTimeout(()=> {
      fn(...args)
    }, delay)
  }
}

const debouncedSave = debounce(saveToDataStore, 10000)

loadFromDatastore()

io.on('connection', function (socket) {

  if (!tower) {
    socket.disconnect()
    return
  }

  socket.emit('onstart', tower.export())

  socket.on('newblock', function(data) {
    const { x, y, z } = data
    if (tower.addBlock(x, y, z)) {
      socket.broadcast.emit('newblock', data)
      debouncedSave()
    }
  })
})

app.use(express.static('dist'))

app.get('/tower.json', (req, res) => {
  res.json(tower.export())
})

const port = process.env.PORT || 8000
server.listen(port, function () {
  console.log('Server listening at port %d', port)
})