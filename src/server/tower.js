const DEFAULT_MAXIMUM_LEVELS = 100
const DEFAULT_DIMENSION = 5

class Tower {
  constructor(arg) {
    this.minHeight = 0
    this.maxHeight = 0
    this.dimension = DEFAULT_DIMENSION
    this.maximumLevels = DEFAULT_MAXIMUM_LEVELS
    Object.assign(this, arg)

    this.halfDimension = (this.dimension - 1) / 2
    if (!this.levels) {
      this.levels = {}
      for (let i = this.minHeight; i <= this.maxHeight; i++) {
        this.levels[i] = this.generateFilledLevel(true)
      }
    }
  }

  generateFilledLevel(value) {
    const level = {}
    for (let i = -this.halfDimension; i <= this.halfDimension; i++) {
      const row = {}
      for (let j = -this.halfDimension; j <= this.halfDimension; j++) {
        row[j] = value
      }
      level[i] = row
    }
    return level
  }

  storesCoordinate(x, y, z) {
    if (y < this.minHeight || y > this.maxHeight) {
      return false
    } else if (x < -this.halfDimension || x > this.halfDimension) {
      return false
    } else if (z < -this.halfDimension || z > this.halfDimension) {
      return false
    }
    return true
  }

  setItem(x, y, z, value) {
    if (!this.storesCoordinate(x, y, z)) {
      return false
    }

    this.levels[y] = this.levels[y] || {}
    this.levels[y][x] = this.levels[y][x] || {}
    this.levels[y][x][z] = value

    return true
  }

  getItem(x, y, z) {
    if (!this.levels[y]) {
      return undefined
    }
    if (!this.levels[y][x]) {
      return undefined
    }
    return this.levels[y][x][z]
  }

  addBlock(x, y, z) {
    // Allow block to increase height
    if (y == this.maxHeight + 1) {
      this.maxHeight = y
      while (this.maxHeight - this.minHeight > this.maximumLevels) {
        delete this.levels[this.minHeight++]
      }
    }

    return this.setItem(x, y, z, true)
  }

  export() {
    return {
      minHeight: this.minHeight,
      maxHeight: this.maxHeight,
      dimension: this.dimension,
      levels: this.levels,
    }
  }
}

module.exports = { Tower }