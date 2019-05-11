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
const urlParams = new URLSearchParams(window.location.search)
const augmentParam = urlParams.get('augment')
const augment = augmentParam !== null && augmentParam !== 'false'

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
const focusHeightDrop = augment ? 10 : 5
let focusHeight = maxHeight - focusHeightDrop

const doPortal = augment

if (augment) {
  document.getElementById('ar').style.display = 'none'

  window.addEventListener('xrandextrasloaded', () => {
    XR.addCameraPipelineModules([
      XR.GlTextureRenderer.pipelineModule(),
      XR.Threejs.pipelineModule(),
      XR.XrController.pipelineModule(),
      XRExtras.FullWindowCanvas.pipelineModule(),
    ])

    XR.addCameraPipelineModule({
      name: 'voxel-tower',
      onStart: ({ canvasWidth, canvasHeight }) => {
        const {scene, camera, renderer} = XR.Threejs.xrScene()

        init(scene, camera, renderer)

        XR.XrController.updateCameraProjectionMatrix({
          origin: camera.position,
          facing: camera.quaternion,
        })
      },
      onUpdate: () => {
        TWEEN.update()
      },
      onException: () => {
        window.location = window.location.href.slice(0, window.location.href.length - window.location.search.length)
      }
    })

    const canvas = document.createElement('canvas')
    document.body.appendChild(canvas)

    XR.run({canvas})
  })

  const xrScript = document.createElement('script')
  xrScript.src = 'https://apps.8thwall.com/xrweb?appKey=29DhVorNmFQDSoVeUEkgNkLAd4bltTIAlBDHrpNTWBXTJS5HPyZQWFUd6nfGqq3PhROcEn'
  document.head.appendChild(xrScript)

  const extrasScript = document.createElement('script')
  extrasScript.src = 'https://cdn.8thwall.com/web/xrextras/xrextras.js'
  document.head.appendChild(extrasScript)

} else {
  init()
  animate()
}

function init(inputScene, inputCamera, inputRenderer) {

  const socket = io()

  if (inputScene) {
    scene = inputScene
  } else {
    scene = new THREE.Scene()
  }

  const cubeMaterial = new THREE.ShaderMaterial({
    uniforms: {
      baseShade: { value: baseShade },
      zShade: { value: zShade },
      yShade: { value: augment ? yShadeFocus : yShade },
    },
    vertexShader, fragmentShader
  })

  if (inputCamera) {
    camera = inputCamera
    camera.position.y = 14
    camera.position.z = 6
  } else {
    if (useOrthographic) {
      var aspect = window.innerWidth / window.innerHeight
      camera = new THREE.OrthographicCamera(frustumSize * aspect / -2, frustumSize * aspect / 2, frustumSize / 2, frustumSize / -2, 1, 1000)
      camera.position.set(orthoDistance, orthoDistance + focusHeight, orthoDistance)
    } else {
      var fov = baseFov / persDistance
      camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, 1, 1000)
      camera.position.set(persDistance, persDistance, persDistance)
    }
    window.addEventListener('resize', onWindowResize, false)
  }

  if (inputRenderer) {
    renderer = inputRenderer
  } else {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(window.innerWidth, window.innerHeight)
    document.body.appendChild(renderer.domElement)

    const mainDuplicate = document.getElementsByTagName('main')[0].cloneNode(true)
    mainDuplicate.setAttribute('aria-hidden', 'true')
    mainDuplicate.classList.add('duplicate')
    document.body.appendChild(mainDuplicate)
  }

  let cubes = []
  let dimension = 0
  let halfDimension = 0

  const raycaster = new THREE.Raycaster()

  let hasInteraction = false
  let interactionStartTime
  let interactionStartX
  let interactionStartY

  let isFocused = false
  let focusChangeTween

  let hideDuplicateTimeout

  const enterFocusView = () => {
    if (isFocused) {
      return
    }
    isFocused = true

    clearTimeout(hideDuplicateTimeout)
    document.body.classList.add('focus')
    document.body.classList.add('show-duplicate')
    if (focusChangeTween) {
      focusChangeTween.stop()
    }
    focusChangeTween = new TWEEN.Tween(cubeMaterial.uniforms.yShade)
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

    document.body.classList.remove('focus')

    clearTimeout(hideDuplicateTimeout)
    hideDuplicateTimeout = setTimeout(() => {
      document.body.classList.remove('show-duplicate')
    }, 500)

    if (focusChangeTween) {
      focusChangeTween.stop()
    }
    focusChangeTween = new TWEEN.Tween(cubeMaterial.uniforms.yShade)
      .to({ value: yShade }, 1000)
      .easing(TWEEN.Easing.Quadratic.Out)
      .onUpdate(function() {
        renderNextFrame = true
      })
      .start()
    renderNextFrame = true
  }

  const handleInteractionStart = ({ clientX, clientY, changedTouches, touches }) => {
    if (augment && touches && touches.length > 1) {
      XR.XrController.recenter()
      return
    }
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

  if (!augment) {
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
  }

  let heightChangeTween
  const updateMaxHeight = (height, force) => {
    if (height <= maxHeight && !force) {
      return
    }

    maxHeight = height

    document.getElementById('towerHeight').textContent = maxHeight

    if (maxHeight - focusHeightDrop > focusHeight || force) {
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
    return cubes.push(createBox(x, y, z, cubeScale, cubeScale, cubeScale, cubeMaterial, cubeBasis))
  }

  let wall, holePlane, bottom
  const portalDepth = 800
  if (doPortal) {
    const wallMaterial = new THREE.MeshBasicMaterial({
      color: 0xd0d0d0,
      side: THREE.BackSide,
    })

    const wallGeometry = new THREE.CylinderBufferGeometry(Math.sqrt(0.5), Math.sqrt(0.5), 1, 4, 1, true, Math.PI / 4)
    wall = new THREE.Mesh(wallGeometry, wallMaterial)
    wall.visible = false
    wall.scale.set(1, portalDepth, 1)
    wall.position.y = portalDepth / -2
    scene.add(wall)

    const bottomGeometry = new THREE.PlaneBufferGeometry()
    bottom = new THREE.Mesh(bottomGeometry, wallMaterial)
    bottom.visible = false
    bottom.rotation.x = Math.PI / 2
    bottom.position.y = -portalDepth
    scene.add(bottom)

    const holeMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      side: THREE.DoubleSide,
      colorWrite: false,
    })

    const holePlaneGeometry = new THREE.RingBufferGeometry(Math.sqrt(0.5), 1000, 4, 1)
    holePlane = new THREE.Mesh(holePlaneGeometry, holeMaterial)
    holePlane.visible = false
    holePlane.rotation.order = 'XZY'
    holePlane.rotation.x = -Math.PI / 2
    holePlane.rotation.z = Math.PI / 4
    holePlane.scale.set(0.001, 0.001, 0.001)
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

    const starterBoxLength = portalDepth + minHeight
    const starterBoxHeight = minHeight - 0.5 - starterBoxLength / 2
    createBox(0, starterBoxHeight, 0, dimension, starterBoxLength, dimension, cubeMaterial, cubeBasis)

    cubeBasis.position.y = doPortal ? -maxHeight - 100 : -minHeight

    if (doPortal) {

      cubeBasis.visible = false
      wall.visible = true
      bottom.visible = true
      holePlane.visible = true

      const portalWidth = 2 + dimension
      wall.scale.x = portalWidth
      wall.scale.z = portalWidth
      bottom.scale.set(portalWidth, portalWidth, portalWidth)

      setTimeout(() => {
        const holeOpenTween = new TWEEN.Tween(holePlane.scale)
          .to({ x: portalWidth, y: portalWidth, z: portalWidth }, 1000)
          .easing(TWEEN.Easing.Quadratic.Out)
          .onUpdate(function() {
            renderNextFrame = true
          })
          .onComplete(() => {
            cubeBasis.visible = true
            updateMaxHeight(maxHeight, true)
          })
          .start()
      })
    } else {
      updateMaxHeight(maxHeight, true)
    }

    renderNextFrame = true
  }, 1000)

  socket.on('newblock', data => {
    createVoxel(data.x, data.y, data.z)
    updateMaxHeight(data.y)
    renderNextFrame = true
  })
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
