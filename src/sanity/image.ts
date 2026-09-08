import {createImageUrlBuilder, type SanityImageSource} from '@sanity/image-url'
import {sanityConfig} from './config'

const builder = createImageUrlBuilder(sanityConfig)

export const urlFor = (source: SanityImageSource) => builder.image(source).auto('format')
