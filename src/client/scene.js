const THREE = window.THREE

const vertexShader = `
varying vec3 vNormal;

void main() {
  vNormal = normal;

  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`

const fragmentShader = `

  uniform float baseShade;
  uniform float zShade;
  uniform float yShade;

  varying vec3 vNormal;
  void main() {
    float v = baseShade + zShade* abs(vNormal.z) + yShade * abs(vNormal.y);
    gl_FragColor = vec4(v,v,v, 1.0);
  }
`

var camera, controls, scene, renderer
let renderNextFrame = false

// Config
const useOrthographic = true
const frustumSize = 20

const orthoDistance = 100
const persDistance = 10
const baseFov = 600

const cubeColor = -1
const cubeScale = 1

const baseShade = 0.94
const zShade = -0.06
const yShade = 0

const zShadeFocus = -0.12
const yShadeFocus = 0.04

let maxHeight = 0
const focusHeightDrop = 5
let focusHeight = maxHeight - focusHeightDrop

const doPortal = false

init()
animate()

function init() {

  const socket = io()

  scene = new THREE.Scene()

  var material = new THREE.ShaderMaterial({
    uniforms: {
      baseShade: { value: baseShade },
      zShade: { value: zShade },
      yShade: { value: yShade },
    },
    vertexShader, fragmentShader
  })

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(window.innerWidth, window.innerHeight)
  document.body.appendChild(renderer.domElement)

  const mainDuplicate = document.getElementsByTagName('main')[0].cloneNode(true)
  mainDuplicate.setAttribute('aria-hidden', 'true')
  mainDuplicate.classList.add('duplicate')
  document.body.appendChild(mainDuplicate)


  let cubes = []
  let dimension = 0
  let halfDimension = 0

  const raycaster = new THREE.Raycaster()

  let hasInteraction = false
  let interactionStartTime
  let interactionStartX
  let interactionStartY

  let isFocused = false
  let backgroundChangeTween = null
  // let exitFocusTimeout = null

  let hideDuplicateTimeout

  const enterFocusView = () => {
    if (isFocused) {
      return
    }
    isFocused = true

    clearTimeout(hideDuplicateTimeout)
    document.body.classList.add('focus')
    document.body.classList.add('show-duplicate')
    if (backgroundChangeTween) {
      backgroundChangeTween.stop()
    }
    backgroundChangeTween = new TWEEN.Tween(material.uniforms.yShade)
      .to({ value: yShadeFocus }, 1000)
      .easing(TWEEN.Easing.Quadratic.Out)
      .onUpdate(function() {
        renderNextFrame = true
      })
      .start()

    renderNextFrame = true
  }

  const exitFocusView = () => {
    if (!isFocused) {
      return
    }
    isFocused = false

    clearTimeout(hideDuplicateTimeout)
    document.body.classList.remove('focus')
    //scene.background.set(backgroundColor

    hideDuplicateTimeout = setTimeout(() => {
      document.body.classList.remove('show-duplicate')
    }, 500)

    if (backgroundChangeTween) {
      backgroundChangeTween.stop()
    }
    backgroundChangeTween = new TWEEN.Tween(material.uniforms.yShade)
      .to({ value: yShade }, 1000)
      .easing(TWEEN.Easing.Quadratic.Out)
      .onUpdate(function() {
        renderNextFrame = true
      })
      .start()
    renderNextFrame = true
  }

  const handleInteractionStart = ({ clientX, clientY, changedTouches }) => {
    hasInteraction = true
    interactionStartTime = performance.now()
    interactionStartX = clientX || changedTouches[0].clientX
    interactionStartY = clientY || changedTouches[0].clientY
  }

  const handleInteractionEnd = ({ clientX, clientY, changedTouches }) => {
    if (!hasInteraction) {
      return
    }
    hasInteraction = false
    const interactionDurationMillis = performance.now() - interactionStartTime

    clientX = clientX || changedTouches[0].clientX
    clientY = clientY || changedTouches[0].clientY

    const dragDistanceSquared =
      Math.pow((clientX - interactionStartX) / window.innerWidth, 2) +
      Math.pow((clientY - interactionStartY) / window.innerHeight, 2)

    if (interactionDurationMillis > 500) {
      // Held too long, not a click
      return
    }
    if (dragDistanceSquared > 0.002) {
      // Dragged too much, not a click
      return
    }

    const x = (clientX / window.innerWidth) * 2 - 1
    const y = - (clientY / window.innerHeight) * 2 + 1

    raycaster.setFromCamera({ x, y }, camera)

    var intersects = raycaster.intersectObjects(cubes)

    if (intersects && intersects[0]) {
      enterFocusView()
      handleIntersection(intersects[0])
      renderNextFrame = true
    } else {
      // Got a click, but it wasn't on tower - leave focus
      exitFocusView()
    }
  }

  const getVoxelPositionFromIntersect = intersect => {
    const position = intersect.face.normal.clone().multiplyScalar(0.5).add(intersect.point)
    position.x = Math.round(position.x)
    position.y = Math.round(position.y - cubeBasis.position.y)
    position.z = Math.round(position.z)
    return position
  }

  const handleIntersection = intersect => {
    const newPosition = getVoxelPositionFromIntersect(intersect)
    if (Math.abs(newPosition.x) > halfDimension || Math.abs(newPosition.z) > halfDimension) {
      return
    }
    socket.emit('newblock', newPosition)
    createVoxel(newPosition.x, newPosition.y, newPosition.z)
    updateMaxHeight(newPosition.y)
  }

  renderer.domElement.addEventListener('mousedown', handleInteractionStart)
  renderer.domElement.addEventListener('mouseup', handleInteractionEnd)
  renderer.domElement.addEventListener('touchstart', handleInteractionStart)
  renderer.domElement.addEventListener('touchend', handleInteractionEnd)

  if (useOrthographic) {
    var aspect = window.innerWidth / window.innerHeight
    camera = new THREE.OrthographicCamera(frustumSize * aspect / -2, frustumSize * aspect / 2, frustumSize / 2, frustumSize / -2, 1, 1000)
    camera.position.set(orthoDistance, orthoDistance + focusHeight, orthoDistance)
  } else {
    var fov = baseFov / persDistance
    camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, 1, 1000)
    camera.position.set(persDistance, persDistance, persDistance)
  }

  // Initialize orbit controls
  controls = new THREE.OrbitControls(camera, renderer.domElement)

  controls.enableDamping = true
  controls.dampingFactor = 0.25
  controls.target.set(0, 0, 0)

  controls.screenSpacePanning = true
  controls.enablePan = false
  controls.enableZoom = false
  controls.rotateSpeed = 0.15

  controls.minPolarAngle = 0.2
  controls.maxPolarAngle = Math.PI / 2 - 0.2
  controls.update()

  let heightChangeTween
  const updateMaxHeight = height => {
    if (height <= maxHeight) {
      return
    }

    maxHeight = height

    document.getElementById('towerHeight').textContent = maxHeight

    if (maxHeight - focusHeightDrop > focusHeight) {
      heightChangeTween && heightChangeTween.stop()

      focusHeight = maxHeight - focusHeightDrop

      heightChangeTween = new TWEEN.Tween(cubeBasis.position)
        .to({ y: -focusHeight }, 1000)
        .easing(TWEEN.Easing.Quadratic.Out)
        .onUpdate(function() {
            renderNextFrame = true
        })
        .start()
    }
  }

  const cubeBasis = new THREE.Object3D()
  scene.add(cubeBasis)

  var box = new THREE.BoxBufferGeometry()
  const createBox = (x, y, z, scaleX, scaleY, scaleZ, material, parent) => {
    const mesh = new THREE.Mesh(box, material)
    mesh.scale.set(scaleX, scaleY, scaleZ)
    mesh.position.set(x, y, z)
    mesh.updateMatrix()
    mesh.matrixAutoUpdate = false
    parent && parent.add(mesh)
    return mesh
  }

  const createVoxel = (x, y, z) => {
    return cubes.push(createBox(x, y, z, cubeScale, cubeScale, cubeScale, material, cubeBasis))
  }

  if (doPortal) {

    const portalWidth = 4

    const wallMaterial = new THREE.MeshBasicMaterial({
      color: 0xd0d0d0,
      side: THREE.DoubleSide,
    })

    const ringGeometry = new THREE.CylinderBufferGeometry(1, 1, 1, 4, 1, true, Math.PI / 4)
    const hider = new THREE.Mesh(ringGeometry, wallMaterial)
    hider.position.y = -1000
    hider.scale.set(portalWidth, -2 * hider.position.y, portalWidth)
    scene.add(hider)

     const hiderMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      side: THREE.DoubleSide,
       colorWrite: false,
    })


    const holePlaneGeometry = new THREE.CylinderBufferGeometry(portalWidth, 1000, 1, 4, 1, true, Math.PI / 4)
    const holePlane = new THREE.Mesh(holePlaneGeometry, hiderMaterial)
    holePlane.position.y = -0.5
    holePlane.renderOrder = -1
    scene.add(holePlane)
  }

  socket.on('onstart', data => {
    cubes.forEach(c => scene.remove(c))
    const { levels, minHeight, maxHeight } = data

    dimension = data.dimension
    halfDimension = (data.dimension - 1) / 2

    for (let y = minHeight; y <= maxHeight; y++) {
      if (!levels[y]) {
         continue
      }
      for(let x = -halfDimension; x <= halfDimension; x++) {
        if (!levels[y][x]) {
          continue
        }
        for(let z = -halfDimension; z <= halfDimension; z++) {
          if (levels[y][x][z]) {
            createVoxel(x, y, z)
          }
        }
      }
    }

    const starterBoxLength = 2000 + minHeight
    const starterBoxHeight = minHeight - 0.5 - starterBoxLength / 2
    createBox(0, starterBoxHeight, 0, dimension, starterBoxLength, dimension, material, cubeBasis)

    cubeBasis.position.y = -minHeight

    updateMaxHeight(maxHeight)
    renderNextFrame = true
  })

  socket.on('newblock', data => {
    createVoxel(data.x, data.y, data.z)
    updateMaxHeight(data.y)
    renderNextFrame = true
  })

  window.addEventListener('resize', onWindowResize, false)
}

function onWindowResize() {
  if (useOrthographic) {
    const aspect = window.innerWidth / window.innerHeight
    camera.left = camera.bottom * aspect
    camera.right = camera.top * aspect
    camera.updateProjectionMatrix()
  } else {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
  }

  renderer.setSize(window.innerWidth, window.innerHeight)

  renderNextFrame = true
}

function animate() {
  requestAnimationFrame(animate)
  TWEEN.update()

  if (controls.update() || renderNextFrame) {
    render()
  }
}

function render() {
  renderer.render(scene, camera)
  renderNextFrame = false
}
