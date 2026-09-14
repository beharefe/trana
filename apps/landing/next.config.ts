import nextra from "nextra"
import config from "./next.config.shared"

const withNextra = nextra({
  contentDirBasePath: "/docs",
})

export default withNextra(config)
