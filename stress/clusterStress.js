const mod = require('./app/util/multiProcess')

const tasks = [({ index }) => {
    require('./stress/stress').start('BU',0).then(() => {
        process.exit(0)
    })
}, ({ index }) => {
    require('./stress/stress').start('PM',0).then(() => {
        process.exit(0)
    })
}, ({ index }) => {
    require('./stress/stress').start('ENG',0).then(() => {
        process.exit(0)
    })
}]
mod.new(tasks).start()
